import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.152.2/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.152.2/examples/jsm/controls/OrbitControls.js';
import { initOptimizedGrass } from './optimized-grass.js';

const container = document.getElementById('app');

// === Scene & Camera ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000510);
scene.fog = new THREE.Fog(0x000510, 10, 50);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 8);

// Camera UI controls (sliders in index.html)
const camXInput = document.getElementById('camX');
const camYInput = document.getElementById('camY');
const camZInput = document.getElementById('camZ');
const camXVal = document.getElementById('camXVal');
const camYVal = document.getElementById('camYVal');
const camZVal = document.getElementById('camZVal');

function updateCamDisplays() {
  if (camXVal) camXVal.textContent = parseFloat(camXInput.value).toFixed(1);
  if (camYVal) camYVal.textContent = parseFloat(camYInput.value).toFixed(1);
  if (camZVal) camZVal.textContent = parseFloat(camZInput.value).toFixed(1);
}

if (camXInput && camYInput && camZInput) {
  // initialize inputs to current camera pos
  camXInput.value = camera.position.x;
  camYInput.value = camera.position.y;
  camZInput.value = camera.position.z;
  updateCamDisplays();

  camXInput.addEventListener('input', updateCamDisplays);
  camYInput.addEventListener('input', updateCamDisplays);
  camZInput.addEventListener('input', updateCamDisplays);
}

// === Renderer ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// === Lights ===
const ambientLight = new THREE.AmbientLight(0x00ffff, 0.3);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0x00cccc, 1, 20);
pointLight.position.set(0, 3, 2);
scene.add(pointLight);

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// === OPTIMIZED GRASS SYSTEM ===
// Use the instanced, GPU-driven grass implementation in `optimized-grass.js`.
// We still perform per-frame wrapping of instance Z positions to simulate
// world movement (so the grass appears continuous as the deer runs).
const grassSystem = initOptimizedGrass(scene, {
  count: 10000, // tune this value for density vs performance
  areaWidth: 50,
  areaRadius:50,
  areaDepth: 80,
  bladeHeight: 0.3
});

// Cache references for efficient per-frame updates
const instOffsetsAttr = grassSystem.mesh.geometry.getAttribute('instanceOffset');
const originalInstanceOffsets = new Float32Array(instOffsetsAttr.array); // copy of original offsets

// === HOLOGRAM SHADERS ===
const vertexShader = `
  #ifdef USE_SKINNING
    #include <skinning_pars_vertex>
  #endif

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;

  void main() {
    #ifdef USE_SKINNING
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      
      // The includes create 'transformed' and 'objectNormal' variables
    #else
      vec3 transformed = position;
      vec3 objectNormal = normal;
    #endif

    vNormal = normalize(normalMatrix * objectNormal);
    vPosition = transformed;
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform float time;
  uniform vec3 glowColor;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;

  void main() {
    // 1. Fresnel Effect (edges glow more than center)
    vec3 viewDirection = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(viewDirection, normal)), 2.5);
    
    // 2. Pulsing effect
    float pulse = sin(time * 1.5) * 0.2 + 0.8;
    
    // 3. Volumetric inner glow
    float innerGlow = pow(1.0 - fresnel, 2.0) * 0.3;
    
    // 4. Combine effects
    vec3 finalColor = glowColor * (fresnel * 1.8 + innerGlow) * pulse;
    float alpha = fresnel * 0.7 + 0.15;
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// === GLTF Loader ===
let mixer;
let deerModel; // Store deer model reference
let shaderMaterials = []; // Changed name to match what's used inside
const loader = new GLTFLoader();
loader.load(
  '/first3D.glb',
  (gltf) => {
    const model = gltf.scene;
    deerModel = model; // Store reference
    scene.add(model);
    console.log('Available animations:', gltf.animations.map(a => a.name));

    // Center & scale
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const scale = 3.5 / size;
    model.scale.setScalar(scale);
    
    // Position deer above the grass, running forward
    model.position.y = 0.5; // Elevate deer above ground level
    model.rotation.y = 0; // Face forward along Z axis

    // Apply hologram shader to all meshes
    const baseShaderMaterial = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        time: { value: 0.0 },
        glowColor: { value: new THREE.Color(0x00ddff) },
      },
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // Remove "const" here - use the outer scope variable
    model.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        const meshShaderMaterial = baseShaderMaterial.clone();
        
        // Enable skinning for SkinnedMesh
        if (child.isSkinnedMesh) {
          meshShaderMaterial.defines = { USE_SKINNING: '' };
        }
        
        child.material = meshShaderMaterial;
        child.frustumCulled = false;
        shaderMaterials.push(meshShaderMaterial); // Now uses outer scope
      }
    });

    mixer = new THREE.AnimationMixer(model);
    let runClip = THREE.AnimationClip.findByName(gltf.animations, 'Rundeer');  

    // Trim the first 4.7 seconds from the animation
    runClip = runClip.clone();
    const startTime = 4.7;
    const endTime = runClip.duration;
    
    // Adjust each track to start from 4.7 seconds
    runClip.tracks.forEach(track => {
      const times = track.times;
      const values = track.values;
      const newTimes = [];
      const newValues = [];
      
      for (let i = 0; i < times.length; i++) {
        if (times[i] >= startTime) {
          newTimes.push(times[i] - startTime);
          const stride = values.length / times.length;
          for (let j = 0; j < stride; j++) {
            newValues.push(values[i * stride + j]);
          }
        }
      }
      
      track.times = new Float32Array(newTimes);
      track.values = new Float32Array(newValues);
    });
    
    runClip.duration = endTime - startTime;

    const action = mixer.clipAction(runClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.play();

    action.timeScale = 1.0;
    console.log('Animation duration:', runClip.duration);

  },
  (xhr) => console.log(`Model ${(xhr.loaded / xhr.total * 100).toFixed(1)}% loaded`),
  (error) => console.error('GLTF load error:', error)
);

// === Resize handler ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === Animate ===
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.033);
    const time = clock.getElapsedTime();

    // Update shader time uniform for all materials
    shaderMaterials.forEach(material => {
      material.uniforms.time.value += delta;
    });

    if (mixer) mixer.update(delta);

    // Deer stays at origin, world moves backward
    const runSpeed = 4;
    const worldOffset = time * runSpeed; // World moves backward
    
    // Deer stays at fixed position
    if (deerModel) {
        // Camera positioned from sliders (or default values if UI not present)
        if (camXInput && camYInput && camZInput) {
          camera.position.x = parseFloat(camXInput.value);
          camera.position.y = parseFloat(camYInput.value);
          camera.position.z = parseFloat(camZInput.value);
        } else {
          // fallback to side view
          camera.position.x = -10;
          camera.position.z = -2;
          camera.position.y = 5;
        }
        camera.lookAt(0, 0.5, 0); // Always look at deer at origin
    }

    // Create moving ripple effects in world space
    const ripple1X = Math.cos(time * 0.3) * 4;
    const ripple1Z = -worldOffset + Math.sin(time * 0.3) * 3;
    
    const ripple2X = Math.cos(time * 0.4 + Math.PI) * 3;
    const ripple2Z = -worldOffset + Math.sin(time * 0.4 + Math.PI) * 4;

    const ripple3X = Math.cos(time * 0.25 + Math.PI * 0.5) * 5;
    const ripple3Z = -worldOffset + Math.sin(time * 0.25 + Math.PI * 0.5) * 3;

    // Update instanced grass offsets to simulate world movement (wrap Z)
    const behindCamera = -35;
    const aheadPosition = 60;
    const zoneSize = aheadPosition - behindCamera;
    const instCount = instOffsetsAttr.count;

    for (let i = 0; i < instCount; i++) {
      const ox = originalInstanceOffsets[i * 3 + 0];
      let oz = originalInstanceOffsets[i * 3 + 2] - worldOffset;
      oz = ((oz - behindCamera) % zoneSize + zoneSize) % zoneSize + behindCamera;

      instOffsetsAttr.array[i * 3 + 0] = ox;
      instOffsetsAttr.array[i * 3 + 1] = 0;
      instOffsetsAttr.array[i * 3 + 2] = oz;
    }
    instOffsetsAttr.needsUpdate = true;

    // Update grass shader uniforms (time-driven animation)
    grassSystem.update(time);


    controls.update();
    renderer.render(scene, camera);
}
animate();

import * as THREE from "three";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "jsm/controls/OrbitControls.js";

const container = document.body;

// === Scene & Camera ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000510);
scene.fog = new THREE.Fog(0x000510, 10, 50);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(-4, 3, -6);

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
controls.target.set(0, 0.5, 0);
controls.update();

// === OPTIMIZED GRASS SYSTEM (Single Points Object) ===
const numBlades = 20000; // Dense grass field
const particlesPerBlade = 20; // More particles per blade for smoother look
const grassRadius = 12;
const totalParticles = numBlades * particlesPerBlade;

// Single geometry for ALL grass particles
const grassGeometry = new THREE.BufferGeometry();
const grassPositions = new Float32Array(totalParticles * 3);
const grassColors = new Float32Array(totalParticles * 3);

// Store blade metadata for animation
const grassBladeData = [];

// Generate all grass particles at once - distributed across FRONT and BACK
let particleIndex = 0;
for (let bladeIdx = 0; bladeIdx < numBlades; bladeIdx++) {
  // Circular distribution
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * grassRadius;
  const baseX = Math.cos(angle) * radius;
  // SPREAD grass along Z axis from front to back (prevents gap)
  const baseZ = (Math.random() - 0.5) * grassRadius * 2; // -grassRadius to +grassRadius
  const height = 0.2 + Math.random() * 0.15;
  const curve = (Math.random() - 0.5) * 0.1;
  const randomOffset = Math.random() * Math.PI * 2;

  // Color variation - Darker cyan/blue for contrast with bright deer
  const cyanVariation = 0.3 + Math.random() * 0.2; // 0.3 to 0.5 (darker)
  const r = 0.0;
  const g = cyanVariation * 0.5; // Less green, more blue
  const b = cyanVariation * 0.8; // Dominant blue

  // Store blade metadata
  grassBladeData.push({
    startIndex: particleIndex,
    baseX: baseX,
    baseZ: baseZ,
    currentZ: baseZ,
    height: height,
    curve: curve,
    randomOffset: randomOffset,
    originalPositions: [],
  });

  // Create particles for this blade
  for (let i = 0; i < particlesPerBlade; i++) {
    const t = i / (particlesPerBlade - 1);
    const x = baseX + curve * t * t;
    const y = t * height;
    const z = baseZ;

    grassPositions[particleIndex * 3] = x;
    grassPositions[particleIndex * 3 + 1] = y;
    grassPositions[particleIndex * 3 + 2] = z;

    grassColors[particleIndex * 3] = r;
    grassColors[particleIndex * 3 + 1] = g;
    grassColors[particleIndex * 3 + 2] = b;

    // Store original positions
    grassBladeData[bladeIdx].originalPositions.push(x, y, z);

    particleIndex++;
  }
}

grassGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(grassPositions, 3)
);
grassGeometry.setAttribute("color", new THREE.BufferAttribute(grassColors, 3));

const grassMaterial = new THREE.PointsMaterial({
  size: 0.04, // Larger particles to fill gaps
  vertexColors: true,
  transparent: true,
  opacity: 0.7, // Less opaque so deer stands out
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

const grassPoints = new THREE.Points(grassGeometry, grassMaterial);
scene.add(grassPoints);

console.log(
  `Grass system: ${numBlades} blades, ${totalParticles} particles in 1 draw call!`
);

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
    // 1. Stronger Fresnel Effect for bright edges
    vec3 viewDirection = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(viewDirection, normal)), 2.0);
    
    // 2. Pulsing effect
    float pulse = sin(time * 1.5) * 0.15 + 0.85;
    
    // 3. Much brighter core with white tint
    float innerGlow = pow(1.0 - fresnel, 1.5) * 0.6;
    
    // 4. Add white to cyan for brighter appearance
    vec3 brightColor = mix(glowColor, vec3(1.0, 1.0, 1.0), 0.4); // Mix 40% white
    
    // 5. Much stronger overall brightness
    vec3 finalColor = brightColor * (fresnel * 2.5 + innerGlow * 1.5) * pulse;
    float alpha = fresnel * 0.85 + 0.3; // More opaque
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// === GLTF Loader ===
let mixer;
let deerModel; // Store deer model reference
let shaderMaterials = []; // Store all shader materials for time uniform updates
const loader = new GLTFLoader();
loader.load(
  "models/first3D.glb",
  (gltf) => {
    const model = gltf.scene;
    deerModel = model; // Store reference
    scene.add(model);
    console.log(
      "Available animations:",
      gltf.animations.map((a) => a.name)
    );

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
        glowColor: { value: new THREE.Color(0x00ffff) }, // Bright cyan
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
          meshShaderMaterial.defines = { USE_SKINNING: "" };
        }

        child.material = meshShaderMaterial;
        child.frustumCulled = false;
        shaderMaterials.push(meshShaderMaterial); // Now uses outer scope
      }
    });

    mixer = new THREE.AnimationMixer(model);
    let runClip = THREE.AnimationClip.findByName(gltf.animations, "Rundeer");
    // Trim the first 4.7 seconds from the animation
    runClip = runClip.clone();
    const startTime = 4.7;
    const endTime = runClip.duration;

    // Adjust each track to start from 4.7 seconds
    runClip.tracks.forEach((track) => {
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
    // Start animation from 4.7 seconds
    const action = mixer.clipAction(runClip);

    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.play();

    action.timeScale = 1.0;
    console.log("Animation duration:", runClip.duration);
  },
  (xhr) =>
    console.log(`Model ${((xhr.loaded / xhr.total) * 100).toFixed(1)}% loaded`),
  (error) => console.error("GLTF load error:", error)
);

// === Resize handler ===
window.addEventListener("resize", () => {
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
  shaderMaterials.forEach((material) => {
    material.uniforms.time.value += delta;
  });

  if (mixer) mixer.update(delta);

  // Deer stays at origin, world moves backward
  const runSpeed = 4;
  const worldOffset = time * runSpeed; // World moves backward

  // Deer stays at fixed position
  if (deerModel) {
    deerModel.position.set(0, 0.5, 0);
  }

  // Create moving ripple effects in world space
  const ripple1X = Math.cos(time * 0.3) * 4;
  const ripple1Z = -worldOffset + Math.sin(time * 0.3) * 3;

  const ripple2X = Math.cos(time * 0.4 + Math.PI) * 3;
  const ripple2Z = -worldOffset + Math.sin(time * 0.4 + Math.PI) * 4;

  const ripple3X = Math.cos(time * 0.25 + Math.PI * 0.5) * 5;
  const ripple3Z = -worldOffset + Math.sin(time * 0.25 + Math.PI * 0.5) * 3;

  // Update OPTIMIZED grass system - single geometry
  const positions = grassGeometry.attributes.position.array;

  for (let bladeIdx = 0; bladeIdx < grassBladeData.length; bladeIdx++) {
    const blade = grassBladeData[bladeIdx];

    // Move grass backward
    blade.currentZ -= runSpeed * delta;

    // Recycle if too far behind
    if (blade.currentZ < -grassRadius) {
      blade.currentZ += grassRadius * 2;
    }

    const grassX = blade.baseX;
    const grassZ = blade.currentZ;

    // Check if within circular bounds
    const currentDist = Math.sqrt(grassX * grassX + grassZ * grassZ);
    const isVisible = currentDist <= grassRadius;

    // Compute ripple distances
    const dist1 = Math.hypot(grassX - ripple1X, grassZ - ripple1Z);
    const dist2 = Math.hypot(grassX - ripple2X, grassZ - ripple2Z);
    const dist3 = Math.hypot(grassX - ripple3X, grassZ - ripple3Z);

    const rippleEffect1 =
      Math.max(0, 1 - dist1 / 6) * Math.sin(time * 2 - dist1 * 0.3) * 1.5;
    const rippleEffect2 =
      Math.max(0, 1 - dist2 / 5) * Math.sin(time * 2.2 - dist2 * 0.35) * 1.2;
    const rippleEffect3 =
      Math.max(0, 1 - dist3 / 7) * Math.sin(time * 1.8 - dist3 * 0.25) * 1.4;
    const totalRippleBase = rippleEffect1 + rippleEffect2 + rippleEffect3;

    // Update each particle in this blade
    for (let i = 0; i < particlesPerBlade; i++) {
      const particleIdx = blade.startIndex + i;
      const t = i / (particlesPerBlade - 1);
      const influence = Math.pow(t, 1.2);

      const wave =
        Math.sin(time + blade.randomOffset + grassZ * 0.1) * influence;
      const wave2 =
        Math.cos(time * 0.8 + blade.randomOffset * 2 + grassX * 0.08) *
        influence;
      const wave3 =
        Math.sin(time * 0.6 + grassZ * 0.15 + grassX * 0.12) * influence;
      const totalRipple = totalRippleBase * influence;

      if (isVisible) {
        positions[particleIdx * 3] =
          blade.originalPositions[i * 3] +
          wave * 0.4 +
          wave2 * 0.2 +
          totalRipple * 0.4;
        positions[particleIdx * 3 + 1] = blade.originalPositions[i * 3 + 1];
        positions[particleIdx * 3 + 2] =
          grassZ + wave3 * 0.15 + totalRipple * 0.25;
      } else {
        // Hide particles outside circle by moving them far away
        positions[particleIdx * 3 + 1] = -1000;
      }
    }
  }

  grassGeometry.attributes.position.needsUpdate = true;

  controls.update();
  renderer.render(scene, camera);
}
animate();

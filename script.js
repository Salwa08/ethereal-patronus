import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
let deerMesh = null;
let shaderMaterial = null;
let particles = null;

// 1. INITIAL SETUP
const w = window.innerWidth;
const h = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);

document.body.appendChild(renderer.domElement);
renderer.setClearColor(0x000000);

const fov = 75;
const aspect = w / h;
const near = 0.1;
const far = 50;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.set(0, 0, 4);

const scene = new THREE.Scene();

// 2. CONTROLS SETUP
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// 3. RESIZE HANDLER
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", handleResize);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  wireframe: true,
});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// VERTEX SHADER
const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// FRAGMENT SHADER
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


// LOAD GLB MODEL
loader.load(
  "models/realistic_deer.glb",
  function (gltf) {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        deerMesh = child;
      }
    });

    if (deerMesh && deerMesh.geometry) {
      console.log("Deer mesh loaded successfully.");
      scene.remove(cube);

      shaderMaterial = new THREE.ShaderMaterial({
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

      deerMesh.material = shaderMaterial;
      deerMesh.scale.set(0.5, 0.5, 0.5);
      deerMesh.rotation.x = -Math.PI / 2;

      scene.add(deerMesh);
      console.log("Holographic deer added to scene.");
    } else {
      console.error("No mesh geometry found in the GLB model.");
    }
  },
  undefined,
  function (error) {
    console.error("Error loading GLB model:", error);
  }
);


// 4. ANIMATION LOOP
function animate() {
  requestAnimationFrame(animate);

  if (shaderMaterial) {
    shaderMaterial.uniforms.time.value += 0.016; //~60fps
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

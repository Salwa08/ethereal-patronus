import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
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

window.PATRONUS_VERTICES = null;

// LOAD GLB MODEL
loader.load(
  "models/realistic_deer.glb",
  function (gltf) {
    let deerMesh = null;

    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        deerMesh = child;
      }
    });

    if (deerMesh && deerMesh.geometry) {
      const positions = deerMesh.geometry.attributes.position.array;

      window.PATRONUS_VERTICES = positions;
      console.log(
        "Patronus vertices loaded:",
        window.PATRONUS_VERTICES.length / 3,
        "vertices"
      );
      scene.remove(cube);

      // Create particles from deer vertices
      createParticlesFromVertices(positions);
    } else {
      console.error("No mesh geometry found in the GLB model.");
    }
  },
  undefined,
  function (error) {
    console.error("Error loading GLB model:", error);
  }
);

// Particles

function createParticlesFromVertices(vertices) {
  // Remove old particles if they exist
  if (particles) {
    scene.remove(particles);
  }

  const PARTICLE_COUNT = vertices.length / 3;

  // Particle Geometry
  const particleGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);

  // Material (Temporary; this will be replaced by ShaderMaterial later)

  const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0x00aaff,
    wireframe: true,
  });

  // Instanced Mesh
  particles = new THREE.InstancedMesh(
    particleGeometry,
    particleMaterial,
    PARTICLE_COUNT
  );

  // Set initial Positions for each particle
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Get vertex position from the loaded vertices
    const x = vertices[i * 3]; // here *3 because each vertex has x,y,z
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];

    // Set matrix for each instance (instance particle)
    const matrix = new THREE.Matrix4();
    matrix.setPosition(x, y, z);
    particles.setMatrixAt(i, matrix);
  }

  particles.instanceMatrix.needsUpdate = true; // Notify Three.js of the update

  // Rotate the deer to stand upright (if it's lying flat)
  particles.rotation.x = -Math.PI / 2; // Rotate 90 degrees around X-axis

  scene.add(particles);

  console.log("Particles created:", PARTICLE_COUNT, "particles");
}

// 4. ANIMATION LOOP
function animate() {
  requestAnimationFrame(animate);

  if (particles) {
    // flight path animation will go here later
    particles.rotation.y += 0.0005; // Gentle rotation around Y-axis (vertical spin)
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

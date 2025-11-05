import * as THREE from 'three';
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { GLTFLoader } from 'jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
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
window.addEventListener('resize', handleResize);



const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({color: 0x00ffff, wireframe: true});
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);



window.PATRONUS_VERTICES = null;

// LOAD GLB MODEL
loader.load('models/realistic_deer.glb', function(gltf) {

        let deerMesh = null;

        gltf.scene.traverse((child)  => {

        if (child.isMesh) {
            deerMesh = child;
        }

        });

        if (deerMesh && deerMesh.geometry) {
            const positions = deerMesh.geometry.attributes.position.array;

            window.PATRONUS_VERTICES = positions;
            console.log('Patronus vertices loaded:', window.PATRONUS_VERTICES.length / 3, 'vertices');
            scene.remove(cube);


        } else {
            console.error('No mesh geometry found in the GLB model.');
        }

}); 



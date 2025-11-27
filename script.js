import * as THREE from "three";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "jsm/controls/OrbitControls.js";

const container = document.body;

// === Scene & Camera ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000510);
scene.fog = new THREE.Fog(0x000510, 10, 50);

const colorUniforms = {
  uAccentColor: { value: new THREE.Color(0x72bcc6) },
  uTime: { value: 0.0 },
};

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
controls.minDistance = 2;

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
    vec3 viewDirection = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.0 - abs(dot(viewDirection, normal)), 2.0);

    float pulse = sin(time * 1.8) * 0.25 + 0.85;
    float innerGlow = pow(1.0 - fresnel, 2.2) * 0.5;

    // Moving scan effect for hologram shimmer
    float scan = sin((vPosition.y * 6.0) + time * 3.0) * 0.5 + 0.5;
    float scanMask = smoothstep(0.45, 0.6, scan) * (1.0 - smoothstep(0.6, 0.75, scan));

    vec3 base = glowColor * (fresnel * 2.4 + innerGlow) * pulse;
    vec3 streak = glowColor * scanMask * pow(fresnel, 1.2) * 1.6;

    vec3 finalColor = base + streak;
    float alpha = clamp(fresnel * 0.85 + 0.45, 0.0, 1.0);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// === GLTF Loader (deer) ===
let mixer;
let deerModel;
let shaderMaterials = [];
const loader = new GLTFLoader();
loader.load(
  "models/first3D.glb",
  (gltf) => {
    const model = gltf.scene;
    deerModel = model;
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    const scale = 3.5 / size;
    model.scale.setScalar(scale);

    model.position.y = 0.5;
    model.rotation.y = 0;

    // Apply hologram shader to all meshes
    const baseShaderMaterial = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        time: { value: 0.0 },
        glowColor: { value: colorUniforms.uAccentColor.value.clone() },
      },
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    model.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        const meshShaderMaterial = baseShaderMaterial.clone();
        if (child.isSkinnedMesh) {
          meshShaderMaterial.defines = { USE_SKINNING: "" };
        }
        child.material = meshShaderMaterial;
        child.frustumCulled = false;
        shaderMaterials.push(meshShaderMaterial);
      }
    });

    // Trim animation to remove idle frames at start
    mixer = new THREE.AnimationMixer(model);
    let runClip = THREE.AnimationClip.findByName(gltf.animations, "Rundeer");
    runClip = runClip.clone();
    const startTime = 4.7;
    const endTime = runClip.duration;

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
    const action = mixer.clipAction(runClip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.play();
    action.timeScale = 1.0;
  },
  undefined,
  (error) => console.error("Model load error:", error)
);

// === OPTIMIZED GRASS SYSTEM (Single Points Object) ===
const numBlades = 20000;
const particlesPerBlade = 20;
const grassRadius = 12;
const totalParticles = numBlades * particlesPerBlade;

const grassGeometry = new THREE.BufferGeometry();
const grassPositions = new Float32Array(totalParticles * 3);
const grassColors = new Float32Array(totalParticles * 3);

const grassBladeData = [];

let particleIndex = 0;
for (let bladeIdx = 0; bladeIdx < numBlades; bladeIdx++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * grassRadius;
  const baseX = Math.cos(angle) * radius;
  const baseZ = (Math.random() - 0.5) * grassRadius * 2;
  const height = 0.2 + Math.random() * 0.1;
  const curve = (Math.random() - 0.5) * 0.1;
  const randomOffset = Math.random() * Math.PI * 2;

  const r = colorUniforms.uAccentColor.value.r;
  const g = colorUniforms.uAccentColor.value.g;
  const b = colorUniforms.uAccentColor.value.b;

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

    grassBladeData[bladeIdx].originalPositions.push(x, y, z);

    particleIndex++;
  }
}

grassGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(grassPositions, 3)
);
grassGeometry.setAttribute("color", new THREE.BufferAttribute(grassColors, 3));

const grassMaterial = new THREE.ShaderMaterial({
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  uniforms: {
    uTime: colorUniforms.uTime,
    uAccentColor: colorUniforms.uAccentColor,
    uOpacity: { value: 0.2 },
    uSize: { value: 0.04 },
  },
  vertexShader: `
    uniform float uTime;
    uniform float uSize;
    attribute vec3 color;
    varying vec3 vColor;
    varying float vSparkle;
    
    void main() {
      vColor = color;
      
      float sparklePhase = position.x * 10.0 + position.z * 8.0;
      vSparkle = sin(uTime * 2.0 + sparklePhase) * 0.5 + 0.5;
      vSparkle = pow(vSparkle, 3.0);
      
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = uSize * 300.0 / -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccentColor;
    uniform float uOpacity;
    varying vec3 vColor;
    varying float vSparkle;
    
    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;
      
      float alpha = smoothstep(0.8, 0.0, dist);
      vec3 finalColor = mix(vColor, uAccentColor * 2.0, vSparkle * 0.6);
      
      gl_FragColor = vec4(finalColor, alpha * uOpacity * (1.0 + vSparkle * 0.5));
    }
  `,
});

const grassPoints = new THREE.Points(grassGeometry, grassMaterial);
scene.add(grassPoints);

if (controls) {
  controls.maxDistance = grassRadius * 1.2;
}

// === PARTICLE TRAIL SYSTEM (shader-based, drift+wiggle) ===
const maxTrailParticles = 50000;
const trailGeometry = new THREE.BufferGeometry();
const trailPositions = new Float32Array(maxTrailParticles * 3);
const trailColors = new Float32Array(maxTrailParticles * 3);
const trailSizes = new Float32Array(maxTrailParticles);
const trailLifetimes = new Float32Array(maxTrailParticles);
const trailAlphas = new Float32Array(maxTrailParticles);
const trailVelocities = new Float32Array(maxTrailParticles * 3);
const trailIds = new Float32Array(maxTrailParticles);

for (let i = 0; i < maxTrailParticles; i++) {
  trailPositions[i * 3] = 0;
  trailPositions[i * 3 + 1] = 0;
  trailPositions[i * 3 + 2] = 0;

  trailColors[i * 3] = colorUniforms.uAccentColor.value.r;
  trailColors[i * 3 + 1] = colorUniforms.uAccentColor.value.g;
  trailColors[i * 3 + 2] = colorUniforms.uAccentColor.value.b;

  trailSizes[i] = 0.3;
  trailLifetimes[i] = 0;
  trailAlphas[i] = 0.6 + Math.random() * 0.2;
  trailVelocities[i * 3] = 0;
  trailVelocities[i * 3 + 1] = 0;
  trailVelocities[i * 3 + 2] = 0;
  trailIds[i] = Math.random() * 10.0;
}

trailGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(trailPositions, 3)
);
trailGeometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));
trailGeometry.setAttribute("aSize", new THREE.BufferAttribute(trailSizes, 1));
trailGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(trailAlphas, 1));
trailGeometry.setAttribute("aId", new THREE.BufferAttribute(trailIds, 1));

const trailMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    u_time: { value: 0.0 },
    uAccentColor: colorUniforms.uAccentColor,
  },
  vertexShader: `
    attribute float aSize;
    attribute float aAlpha;
    attribute float aId;
    attribute vec3 color;
    uniform float u_time;
    varying float vAlpha;
    varying vec3 vColor;
    varying float vSparkle;
    void main() {
      vAlpha = aAlpha;
      vColor = color;
      
      vSparkle = sin(u_time * 3.0 + aId * 6.28) * 0.5 + 0.5;
      vSparkle = pow(vSparkle, 4.0);
      vec3 pos = position;
      float t = u_time;

      // Drift and wiggle for organic motion
      pos.x += sin(t * 0.5 + aId) * 0.08;
      pos.y += cos(t * 0.2 + aId * 1.3) * 0.04;
      pos.z += sin(t * 0.4 + aId * 2.0) * 0.06;

      pos.x += sin(t * 2.0 + aId * 8.0) * 0.01;
      pos.y += cos(t * 3.0 + aId * 6.7) * 0.01;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

      gl_PointSize = aSize * (15.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uAccentColor;
    varying float vAlpha;
    varying vec3 vColor;
    varying float vSparkle;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float mask = smoothstep(0.9, 0.0, d);
      
      vec3 col = mix(vColor, uAccentColor * 2.5, vSparkle * 0.7);
      float finalAlpha = vAlpha * (1.0 + vSparkle * 0.5);
      
      gl_FragColor = vec4(col * mask, mask * finalAlpha);
    }
  `,
});

const trailPoints = new THREE.Points(trailGeometry, trailMaterial);
trailPoints.frustumCulled = false;
scene.add(trailPoints);

let currentTrailIndex = 0;
let emissionTimer = 0;
const emissionRate = 0.02;
const trailMaxLife = 4;

// === Resize handler ===
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === Animate ===
const clock = new THREE.Clock();

let prevDeerPos = new THREE.Vector3();
let deerPosInitialized = false;

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);
  const time = clock.getElapsedTime();

  colorUniforms.uTime.value = time;

  shaderMaterials.forEach((material) => {
    material.uniforms.time.value += delta;
  });

  if (mixer) mixer.update(delta);

  const runSpeed = 8;
  const worldOffset = time * runSpeed;

  if (deerModel) {
    deerModel.position.set(0, 0.5, 0);
  }

  // Create moving ripple effects
  const ripple1X = Math.cos(time * 0.3) * 4;
  const ripple1Z = -worldOffset + Math.sin(time * 0.3) * 3;

  const ripple2X = Math.cos(time * 0.4 + Math.PI) * 3;
  const ripple2Z = -worldOffset + Math.sin(time * 0.4 + Math.PI) * 4;

  const ripple3X = Math.cos(time * 0.25 + Math.PI * 0.5) * 5;
  const ripple3Z = -worldOffset + Math.sin(time * 0.25 + Math.PI * 0.5) * 3;

  const positions = grassGeometry.attributes.position.array;

  for (let bladeIdx = 0; bladeIdx < grassBladeData.length; bladeIdx++) {
    const blade = grassBladeData[bladeIdx];

    blade.currentZ -= runSpeed * delta;

    if (blade.currentZ < -grassRadius) {
      blade.currentZ += grassRadius * 2;
    }

    const grassX = blade.baseX;
    const grassZ = blade.currentZ;

    const currentDist = Math.sqrt(grassX * grassX + grassZ * grassZ);
    const isVisible = currentDist <= grassRadius;

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
        positions[particleIdx * 3 + 1] = -1000;
      }
    }
  }

  grassGeometry.attributes.position.needsUpdate = true;

  if (trailMaterial.uniforms && trailMaterial.uniforms.u_time)
    trailMaterial.uniforms.u_time.value = time;

  if (deerModel) {
    const deerWorldPos = new THREE.Vector3();
    const deerForward = new THREE.Vector3();
    const deerRight = new THREE.Vector3();
    deerModel.getWorldPosition(deerWorldPos);
    deerModel.getWorldDirection(deerForward);
    deerRight.crossVectors(deerForward, new THREE.Vector3(0, 1, 0)).normalize();

    if (deerPosInitialized) {
      const deerMovement = new THREE.Vector3().subVectors(
        deerWorldPos,
        prevDeerPos
      );

      for (let p = 0; p < maxTrailParticles; p++) {
        if (trailLifetimes[p] > 0) {
          trailPositions[p * 3] += deerMovement.x;
          trailPositions[p * 3 + 1] += deerMovement.y;
          trailPositions[p * 3 + 2] += deerMovement.z;
        }
      }
    }

    prevDeerPos.copy(deerWorldPos);
    deerPosInitialized = true;

    deerWorldPos.y += 1.5;

    const sideSign = Math.sign(Math.sin(time * 0.8)) || 1;

    emissionTimer += delta;
    while (emissionTimer >= emissionRate) {
      const lateral = (0.1 + Math.random() * 0.8) * sideSign;
      const sideOffset = deerRight.clone().multiplyScalar(lateral);

      const forwardOffset = deerForward
        .clone()
        .multiplyScalar(-(0.2 + Math.random() * 0.18));
      const spawnPos = new THREE.Vector3()
        .copy(deerWorldPos)
        .add(sideOffset)
        .add(forwardOffset);

      const backSpeed = 9 + Math.random() * 2.0;

      const baseVX = -deerForward.x * backSpeed + deerRight.x * lateral;
      const baseVY = (Math.random() - 0.5) * 5;
      const baseVZ = -deerForward.z * backSpeed + deerRight.z * lateral;
      const particlesPerEmit = 20;

      const spread = 1;
      for (let b = 0; b < particlesPerEmit; b++) {
        trailPositions[currentTrailIndex * 3] =
          spawnPos.x + (Math.random() - 0.5) * spread;
        trailPositions[currentTrailIndex * 3 + 1] =
          spawnPos.y + (Math.random() - 0.5) * (spread * 0.5);
        trailPositions[currentTrailIndex * 3 + 2] =
          spawnPos.z + (Math.random() - 0.5) * spread;

        trailVelocities[currentTrailIndex * 3] = baseVX;
        trailVelocities[currentTrailIndex * 3 + 1] = baseVY;
        trailVelocities[currentTrailIndex * 3 + 2] = baseVZ;

        trailLifetimes[currentTrailIndex] = trailMaxLife;
        trailAlphas[currentTrailIndex] = 0.8;
        trailSizes[currentTrailIndex] = 0.8 + Math.random() * 1.4;
        trailColors[currentTrailIndex * 3] = colorUniforms.uAccentColor.value.r;
        trailColors[currentTrailIndex * 3 + 1] =
          colorUniforms.uAccentColor.value.g;
        trailColors[currentTrailIndex * 3 + 2] =
          colorUniforms.uAccentColor.value.b;

        currentTrailIndex = (currentTrailIndex + 1) % maxTrailParticles;
      }

      emissionTimer -= emissionRate;
    }
  }

  for (let i = 0; i < maxTrailParticles; i++) {
    if (trailLifetimes[i] > 0) {
      trailLifetimes[i] -= delta;
      const idx3 = i * 3;
      trailVelocities[idx3] *= 0.995;
      trailVelocities[idx3 + 1] *= 0.995;
      trailVelocities[idx3 + 2] *= 0.995;

      trailPositions[idx3] += trailVelocities[idx3] * delta;
      trailPositions[idx3 + 1] += trailVelocities[idx3 + 1] * delta;
      trailPositions[idx3 + 2] += trailVelocities[idx3 + 2] * delta;

      trailAlphas[i] = Math.max(0, trailLifetimes[i] / trailMaxLife);
      trailSizes[i] *= 0.998;
    } else {
      trailPositions[i * 3 + 1] = -1000;
      trailAlphas[i] = 0.0;
    }
  }

  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.color.needsUpdate = true;
  if (trailGeometry.attributes.aSize)
    trailGeometry.attributes.aSize.needsUpdate = true;
  if (trailGeometry.attributes.aAlpha)
    trailGeometry.attributes.aAlpha.needsUpdate = true;
  if (trailGeometry.boundingSphere)
    trailGeometry.boundingSphere.set(new THREE.Vector3(0, 0, 0), 1000);

  // Camera boundary protection
  const camHorizontalDist = Math.hypot(camera.position.x, camera.position.z);
  const grassFrontOnlyRadius = grassRadius * 0.95;
  const minCameraY = 0.6;
  const maxDownwardPitch = -0.15;

  const maxHoriz = grassRadius * 1.2;
  if (camHorizontalDist > maxHoriz) {
    const scale = maxHoriz / camHorizontalDist;
    camera.position.x *= scale;
    camera.position.z *= scale;
    controls.update();
  }

  if (camHorizontalDist < grassFrontOnlyRadius) {
    if (camera.position.y < minCameraY) {
      camera.position.y = minCameraY;
      controls.update();
    }

    const camDirCheck = new THREE.Vector3();
    camera.getWorldDirection(camDirCheck);
    if (camDirCheck.y < maxDownwardPitch) {
      camera.position.y = Math.max(camera.position.y, minCameraY + 0.2);
      controls.update();
    }
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();

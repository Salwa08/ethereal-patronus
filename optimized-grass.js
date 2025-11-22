import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';

// Optimized grass module using a single InstancedMesh and GPU vertex displacement.
// Exports: initOptimizedGrass(scene, opts) -> { update(time) }

export function initOptimizedGrass(scene, opts = {}) {
  const count = opts.count ; 
  const areaRadius = opts.areaRadius ; // radius of the grass disk
  const bladeHeight = opts.bladeHeight ?? 0.25;
  const bladeWidth = opts.bladeWidth ?? 0.02;
  const color = opts.color ?? new THREE.Color(0x2bdfff);

  // Build a patch geometry containing multiple small blades.
  // Each patch will contain `bladesPerPatch` blades baked into a single BufferGeometry.
  const bladesPerPatch = opts.bladesPerPatch ?? 70; // tune: blades per patch
  const patchRadius = Math.max(bladeWidth * 1.2, opts.patchRadius ?? 0.8);

  // Base single-blade geometry (non-indexed) used as a template for copying into a patch
  const baseBlade = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 4).toNonIndexed();
  baseBlade.translate(0, bladeHeight / 4, 0);
  const basePosAttr = baseBlade.getAttribute('position');
  const baseVertexCount = basePosAttr.count;

  // Prepare patch arrays
  const patchVertexCount = baseVertexCount * bladesPerPatch;
  const patchPositions = new Float32Array(patchVertexCount * 3);
  const patchAHeight = new Float32Array(patchVertexCount);
  const patchBladeSeed = new Float32Array(patchVertexCount);

  let writeIndex = 0;
  for (let b = 0; b < bladesPerPatch; b++) {
    // local random position inside patch disk
    const r = Math.sqrt(Math.random()) * patchRadius;
    const theta = Math.random() * Math.PI * 2;
    const lx = Math.cos(theta) * r;
    const lz = Math.sin(theta) * r;
    const lrot = Math.random() * Math.PI * 2;
    const s = Math.sin(lrot), c = Math.cos(lrot);
    const bladeSeed = Math.random() * Math.PI * 2;

    for (let v = 0; v < baseVertexCount; v++) {
      const px = basePosAttr.getX(v);
      const py = basePosAttr.getY(v);
      const pz = basePosAttr.getZ(v);

      // rotate around Y and translate to local patch position
      const rx = px * c - pz * s + lx;
      const rz = px * s + pz * c + lz;

      patchPositions[writeIndex * 3 + 0] = rx;
      patchPositions[writeIndex * 3 + 1] = py;
      patchPositions[writeIndex * 3 + 2] = rz;

      patchAHeight[writeIndex] = py / bladeHeight;
      patchBladeSeed[writeIndex] = bladeSeed;

      writeIndex++;
    }
  }

  const patchGeometry = new THREE.BufferGeometry();
  patchGeometry.setAttribute('position', new THREE.BufferAttribute(patchPositions, 3));
  patchGeometry.setAttribute('aVertexHeight', new THREE.BufferAttribute(patchAHeight, 1));
  patchGeometry.setAttribute('aBladeSeed', new THREE.BufferAttribute(patchBladeSeed, 1));

  // This geometry represents one patch (many blades). We'll instance this.
  const nonIndexed = patchGeometry;

  // Instanced attributes
  const instGeometry = nonIndexed;
  const instanceOffsets = new Float32Array(count * 3);
  const instanceScales = new Float32Array(count);
  const instanceSeed = new Float32Array(count);
  const instanceHue = new Float32Array(count);
  const instanceRotation = new Float32Array(count); // Y rotation per blade

  // Distribute blades inside a disk (areaRadius) with slightly higher density near center
  for (let i = 0; i < count; i++) {
    // sample radius with sqrt to bias towards center (more natural)
    const r = Math.sqrt(Math.random()) * areaRadius;
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;

    instanceOffsets[i * 3 + 0] = x;
    instanceOffsets[i * 3 + 1] = 10e-3; // slight offset above ground to avoid z-fighting
    instanceOffsets[i * 3 + 2] = z;

    instanceScales[i] = 0.6 + Math.random() * 1.0; 
    instanceSeed[i] = Math.random() * Math.PI * 2;
    instanceHue[i] = Math.random() * 0.20 - 0.06; // small color variation around base hue
    instanceRotation[i] = Math.random() * Math.PI * 2; // random rotation so blades aren't aligned
  }

  instGeometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(instanceOffsets, 3));
  instGeometry.setAttribute('instanceScale', new THREE.InstancedBufferAttribute(instanceScales, 1));
  instGeometry.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(instanceSeed, 1));
  instGeometry.setAttribute('instanceHue', new THREE.InstancedBufferAttribute(instanceHue, 1));
  instGeometry.setAttribute('instanceRotation', new THREE.InstancedBufferAttribute(instanceRotation, 1));

  // Shader material: simple translucent holographic grass with vertex displacement
  const vertexShader = `
    attribute float aVertexHeight;
    attribute vec3 instanceOffset;
    attribute float instanceScale;
    attribute float instanceSeed;
    attribute float instanceRotation;
    attribute float aBladeSeed;
    varying float vHeight;
    varying float vSeed;
    varying float vInstScale;
    varying float vHue;
    varying float vBladeSeed;

    uniform float time;

    void main() {
      vHeight = aVertexHeight;
      vSeed = instanceSeed;
      vInstScale = instanceScale;
      vHue = instanceRotation; // pass rotation to fragment if needed (also reuse to vary color)
      vBladeSeed = aBladeSeed;

      vec3 pos = position;

      // rotate blade geometry around Y by instanceRotation so blades don't look identical
      float s = sin(instanceRotation);
      float c = cos(instanceRotation);
      vec3 rotatedPos = pos;
      rotatedPos.x = pos.x * c - pos.z * s;
      rotatedPos.z = pos.x * s + pos.z * c;

      // base wind: bend increases with height, include per-blade seed for variation inside patch
      float wind = sin(time * 1.2 + instanceSeed * 0.5 + aBladeSeed * 0.35 + instanceOffset.x * 0.05 + instanceOffset.z * 0.03);
      float bend = wind * (0.12 * vInstScale) * pow(aVertexHeight, 1.2);

      // local ripple (from deer/world) -- user can modulate with external params if desired
      float ripple = sin(time * 2.0 + instanceOffset.z * 0.15 - instanceOffset.x * 0.08 + aBladeSeed * 0.1) * 0.04 * (1.0 - aVertexHeight);

      rotatedPos.x += bend + ripple;

      // scale blade vertically
      rotatedPos.y *= instanceScale;

      // world transform by instance offset
      vec4 worldPosition = modelMatrix * vec4(rotatedPos + instanceOffset, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = `
    precision mediump float;
    uniform vec3 baseColor;
    varying float vHeight;
    varying float vSeed;
    varying float vInstScale;
    varying float vHue;

    void main() {
      // color gradient along blade (reduced to avoid overpowering scene)
      float t = smoothstep(0.0, 1.0, vHeight);

      // base tint is dimmer and has less contrast from base->tip
      vec3 c = baseColor * (0.35 + 0.45 * (1.0 - t));
      
      // very subtle per-instance variation
      c *= (1.0 + (vHue * 0.05));

      // lower alpha so grass doesn't dominate hologram colors
      float alpha = 0.35 * (0.3 + 0.6 * t);

      // reduce glow at tips
      alpha += pow(t, 3.0) * 0.08;

      gl_FragColor = vec4(c, alpha);
    }
  `;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      time: { value: 0 },
      baseColor: { value: color }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide
  });

  // Create a Mesh with InstancedMesh behavior by creating a Mesh and telling the renderer to draw instances
  // Three.js provides InstancedMesh class which we should use for compatibility
  const mesh = new THREE.InstancedMesh(instGeometry, material, count);

  // Set instance matrices to identity; we use per-vertex instanceOffset in shader instead of instanceMatrix
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  mesh.frustumCulled = false; // let shader decide visibility; avoids per-instance culling overhead

  scene.add(mesh);

  // Return update function for animation loop
  function update(timeSeconds) {
    material.uniforms.time.value = timeSeconds;
  }

  return { mesh, update };
}

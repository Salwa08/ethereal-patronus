# Ethereal Patronus

An interactive 3D holographic deer scene built with Three.js, featuring a glowing animated deer running through dynamic particle grass with atmospheric effects.

## Live Demo

**[View Live Project](https://ethereal-patronus.vercel.app)**

## Features

- **Holographic Deer**: Animated 3D model with custom GLSL shaders creating a Fresnel glow effect
- **Dynamic Grass System**: 400,000 particles with wave animations and sparkle effects
- **Particle Trail**: 50,000 trailing particles following the deer with physics simulation
- **Interactive Camera**: Smooth orbital controls with zoom and rotation
- **Optimized Performance**: 60 FPS with 450,000 total particles using efficient rendering techniques

## Technologies Used

- Three.js (WebGL 3D library)
- GLSL (Custom vertex and fragment shaders)
- JavaScript (ES6+)
- HTML5 Canvas

## Key Technical Highlights

- **Unified Color System**: Centralized shader uniform management for consistent theming
- **Custom Shaders**: Three separate shader systems (deer, grass, trail) with sparkle effects
- **Skeletal Animation**: GLTF model with bone-based animation and trimming
- **Particle Optimization**: Single draw call per system (3 total for entire scene)
- **Physics-Based Trail**: Velocity, damping, and lifetime decay for realistic motion
- **Camera Boundaries**: Protected viewing angles to maintain scene immersion

## Performance Metrics

- Total Particles: 450,000 (400k grass + 50k trail)
- Frame Rate: 60 FPS
- Draw Calls: 3 (deer, grass, trail)
- Render Time: <16ms per frame

## Setup Instructions

### Prerequisites

- Modern web browser with WebGL support
- Local web server (for development)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/Salwa08/ethereal-patronus.git
cd ethereal-patronus
```

2. Start a local server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js http-server
npx http-server

# Using VS Code Live Server extension
# Right-click index.html and select "Open with Live Server"
```

3. Open your browser and navigate to:

```
http://localhost:8000
```

## Project Structure

```
ethereal-patronus/
├── index.html              # Main HTML entry point
├── script.js               # Three.js application logic
├── models/
│   └── first3D.glb         # Animated deer 3D model

```

## Controls

- **Left Click + Drag**: Rotate camera around the deer
- **Right Click + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out
- **Auto-rotation**: Camera smoothly follows with damping

## Shader Effects

### Deer Hologram Shader

- Fresnel edge glow (physics-based rim lighting)
- Pulsing animation (breathing effect at 1.8 Hz)
- Vertical scan shimmer (traveling wave effect)
- Translucent appearance with additive blending

### Grass Particle Shader

- Animated sparkles with phase variation
- Three overlapping wave systems
- Three moving ripple effects
- Circular boundary management

### Trail Particle Shader

- Sharp sparkle effects (pow 4.0 for dramatic flash)
- Drift and wiggle motion for organic feel
- Physics-based movement with velocity damping
- Side-flip emission pattern

## Color Theme

Primary accent color: `#72bcc6` (Cyan)

- Applied consistently across all shaders via unified uniform system
- Easy to modify by changing `colorUniforms.uAccentColor` value

## Browser Compatibility

- Chrome 90+ (Recommended)
- Firefox 88+
- Safari 14+
- Edge 90+

Requires WebGL 1.0 support and ES6 JavaScript features.

## Performance Optimization Techniques

1. **BufferGeometry Batching**: Single geometry for 400,000 grass particles (1 draw call instead of 20,000)
2. **GPU-Based Effects**: Sparkles calculated in shaders rather than CPU
3. **Efficient Memory Management**: Float32Array buffers for trail particles
4. **Frustum Culling Control**: Selective culling for animated meshes
5. **Delta Time Capping**: Prevents performance spiral on slow devices
6. **Pixel Ratio Limiting**: Caps at 2x for high-DPI displays

## Known Limitations

- Large particle count may impact performance on low-end devices
- WebGL 1.0 required (not compatible with older browsers)
- 3D model file (first3D.glb) must be present in models/ directory

## Future Enhancements

- Multiple deer with flocking behavior
- Sound effects (footsteps, ambient forest)
- Post-processing bloom for stronger glow
- Weather effects (rain, mist)
- Interactive Patronus Test: Get your spirit animal and cast your own protective charm (inspired by Harry Potter's magical guardian spell)

## Credits

**Developers**:

- Salwa Khattami [@Salwa08](https://github.com/Salwa08)
- Nouhaila Mouftah [@byeolunu](https://github.com/byeolunu)
- Chaymaa Akrraye [@chaymaa09](https://github.com/chaymaa09)
- Mohamed Echchyoughi [@echchyoughi](https://github.com/echchyoughi)

**Course**: IAGI CI-2 WebGL Project  
**Institution**: ENSAM Casablanca  
**Year**: 2025

## License

This project is open source and available for educational purposes.

## Acknowledgments

- Three.js community for excellent documentation
- GLSL shader references from The Book of Shaders
- 3D model and animation assets
- threejs-journey tutorials for guidance
- Holographic Material was inspired by Anderson Mancini's work:  
  [Holographic Material - Anderson Mancini](https://github.com/ektogamat/threejs-holographic-material)

---

**Built with Three.js and WebGL**  
**Repository**: [github.com/Salwa08/ethereal-patronus](https://github.com/Salwa08/ethereal-patronus)

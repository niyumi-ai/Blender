// ============================================================================
// MOTIONSCRIPT ENGINE - Standalone Module
// Drop-in 3D animation engine for websites
// Version: 1.0.0
// ============================================================================

class MotionScriptEngine {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.options = {
            autoResize: options.autoResize !== false,
            antialias: options.antialias !== false,
            shadows: options.shadows !== false,
            pixelRatio: options.pixelRatio || Math.min(window.devicePixelRatio, 2),
            onError: options.onError || console.error,
            onLoad: options.onLoad || (() => {}),
            onFrame: options.onFrame || (() => {})
        };

        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // State
        this.sceneState = {
            objects: new Map(),
            lights: new Map(),
            animations: [],
            settings: {}
        };

        // Animation
        this.currentTime = 0;
        this.duration = 3;
        this.isPlaying = false;
        this.loop = true;

        // Performance
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();

        this.init();
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    init() {
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: this.options.antialias,
            alpha: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(this.options.pixelRatio);

        if (this.options.shadows) {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        // Handle resize
        if (this.options.autoResize) {
            window.addEventListener('resize', () => this.handleResize());
        }

        // Start render loop
        this.animate();
    }

    handleResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    loadScript(code) {
        try {
            // Parse code
            const commands = this.parseCode(code);

            // Clear existing scene
            this.clear();

            // Build scene
            this.buildScene(commands);

            // Notify success
            this.options.onLoad();

            return { success: true };
        } catch (error) {
            this.options.onError(error);
            return { success: false, error: error.message };
        }
    }

    play() {
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
    }

    stop() {
        this.isPlaying = false;
        this.currentTime = 0;
    }

    seek(time) {
        this.currentTime = Math.max(0, Math.min(time, this.duration));
    }

    getProgress() {
        return this.currentTime / this.duration;
    }

    getFPS() {
        return this.fps;
    }

    getCurrentTime() {
        return this.currentTime;
    }

    getDuration() {
        return this.duration;
    }

    destroy() {
        this.clear();
        this.isPlaying = false;
        if (this.renderer) {
            this.renderer.dispose();
        }
    }

    // ========================================================================
    // PARSING
    // ========================================================================

    parseCode(text) {
        const commands = {
            scene: {},
            objects: {},
            lights: {},
            camera: {},
            animations: []
        };

        // Extract blocks
        const blockRegex = /(scene|object|light|camera|animate)\s+(\w+)?\s*\{([^}]*)\}/g;
        let match;

        while ((match = blockRegex.exec(text)) !== null) {
            const type = match[1];
            const id = match[2] || 'default';
            const content = match[3].trim();

            switch(type) {
                case 'scene':
                    commands.scene = this.parseProperties(content);
                    break;
                case 'object':
                    commands.objects[id] = this.parseProperties(content);
                    break;
                case 'light':
                    commands.lights[id] = this.parseProperties(content);
                    break;
                case 'camera':
                    commands.camera = this.parseProperties(content);
                    break;
                case 'animate':
                    commands.animations.push(this.parseAnimation(id, content));
                    break;
            }
        }

        return commands;
    }

    parseProperties(content) {
        const props = {};
        const lines = content.split('\n');

        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('//')) return;

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) return;

            const key = line.substring(0, colonIndex).trim();
            const value = line.substring(colonIndex + 1).trim();

            props[key] = this.parseValue(value);
        });

        return props;
    }

    parseValue(value) {
        value = value.split('//')[0].trim();

        // Boolean
        if (value === 'true' || value === 'on') return true;
        if (value === 'false' || value === 'off') return false;

        // Time
        if (value.endsWith('s')) {
            return parseFloat(value);
        }

        // Vector
        if (value.includes(',')) {
            const parts = value.split(',').map(p => parseFloat(p.trim()));
            return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
        }

        // Number
        if (!isNaN(value)) {
            return parseFloat(value);
        }

        // String
        return value;
    }

    parseAnimation(targetId, content) {
        const animation = {
            target: targetId,
            keyframes: [],
            easing: 'linear'
        };

        const lines = content.split('\n');
        
        lines.forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('//')) return;

            const keyframeMatch = line.match(/at\s+([\d.]+)s\s*->\s*(\w+):\s*(.+)/);
            if (keyframeMatch) {
                animation.keyframes.push({
                    time: parseFloat(keyframeMatch[1]),
                    property: keyframeMatch[2],
                    value: this.parseValue(keyframeMatch[3])
                });
            }

            if (line.startsWith('easing:')) {
                animation.easing = line.split(':')[1].trim();
            }
        });

        animation.keyframes.sort((a, b) => a.time - b.time);
        return animation;
    }

    // ========================================================================
    // SCENE BUILDING
    // ========================================================================

    buildScene(commands) {
        // Apply scene settings
        if (commands.scene.background) {
            this.scene.background = new THREE.Color(commands.scene.background);
        }
        if (commands.scene.duration !== undefined) {
            this.duration = commands.scene.duration;
        }
        if (commands.scene.loop !== undefined) {
            this.loop = commands.scene.loop;
        }

        // Create objects
        Object.keys(commands.objects).forEach(id => {
            const def = commands.objects[id];
            const mesh = this.createObject(def);
            this.scene.add(mesh);
            this.sceneState.objects.set(id, { mesh, def });
        });

        // Create lights
        Object.keys(commands.lights).forEach(id => {
            const def = commands.lights[id];
            const light = this.createLight(def);
            this.scene.add(light);
            this.sceneState.lights.set(id, { light, def });
        });

        // Set camera
        if (commands.camera.position) {
            const pos = commands.camera.position;
            this.camera.position.set(pos.x, pos.y, pos.z);
        }
        if (commands.camera.lookAt) {
            const look = commands.camera.lookAt;
            this.camera.lookAt(look.x, look.y, look.z);
        }

        // Store animations
        this.sceneState.animations = commands.animations;
    }

    createObject(props) {
        const type = props.type || 'sphere';
        const color = props.color || '#ffffff';
        const emissive = props.emissive || '#000000';
        const intensity = props.intensity || 0;
        const metalness = props.metalness || 0.5;
        const roughness = props.roughness || 0.5;

        // Create geometry
        let geometry;
        switch(type) {
            case 'sphere':
                geometry = new THREE.SphereGeometry(1, 32, 32);
                break;
            case 'cube':
            case 'box':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(10, 10);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                break;
            case 'torus':
                geometry = new THREE.TorusGeometry(1, 0.4, 16, 100);
                break;
            default:
                geometry = new THREE.SphereGeometry(1, 32, 32);
        }

        // Create material
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(emissive),
            emissiveIntensity: intensity,
            metalness: metalness,
            roughness: roughness
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Apply transformations
        if (props.position) {
            mesh.position.set(props.position.x, props.position.y, props.position.z);
        }
        if (props.scale) {
            mesh.scale.set(props.scale.x, props.scale.y, props.scale.z);
        }
        if (props.rotation) {
            mesh.rotation.set(
                props.rotation.x * Math.PI / 180,
                props.rotation.y * Math.PI / 180,
                props.rotation.z * Math.PI / 180
            );
        }

        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    createLight(props) {
        const type = props.type || 'directional';
        const color = props.color || '#ffffff';
        const intensity = props.intensity || 1;

        let light;
        switch(type) {
            case 'directional':
                light = new THREE.DirectionalLight(new THREE.Color(color), intensity);
                light.castShadow = props.shadow !== false;
                if (light.castShadow) {
                    light.shadow.mapSize.width = 2048;
                    light.shadow.mapSize.height = 2048;
                }
                break;
            case 'point':
                light = new THREE.PointLight(new THREE.Color(color), intensity, 100);
                light.castShadow = props.shadow !== false;
                break;
            case 'ambient':
                light = new THREE.AmbientLight(new THREE.Color(color), intensity);
                break;
            default:
                light = new THREE.DirectionalLight(new THREE.Color(color), intensity);
        }

        if (props.position) {
            light.position.set(props.position.x, props.position.y, props.position.z);
        }

        return light;
    }

    clear() {
        while(this.scene.children.length > 0) {
            const object = this.scene.children[0];
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(mat => mat.dispose());
                } else {
                    object.material.dispose();
                }
            }
            this.scene.remove(object);
        }

        this.sceneState.objects.clear();
        this.sceneState.lights.clear();
        this.sceneState.animations = [];
        this.currentTime = 0;
    }

    // ========================================================================
    // ANIMATION
    // ========================================================================

    updateAnimations(deltaTime) {
        if (!this.isPlaying) return;

        this.currentTime += deltaTime;

        if (this.currentTime >= this.duration) {
            if (this.loop) {
                this.currentTime = this.currentTime % this.duration;
            } else {
                this.currentTime = this.duration;
                this.isPlaying = false;
            }
        }

        // Update each animation
        this.sceneState.animations.forEach(anim => {
            const target = this.getAnimationTarget(anim.target);
            if (!target) return;

            // Group keyframes by property
            const properties = {};
            anim.keyframes.forEach(kf => {
                if (!properties[kf.property]) {
                    properties[kf.property] = [];
                }
                properties[kf.property].push(kf);
            });

            // Interpolate each property
            Object.keys(properties).forEach(propName => {
                const keyframes = properties[propName];
                const value = this.interpolate(keyframes, anim.easing);
                
                if (value !== null) {
                    this.applyValue(target, propName, value);
                }
            });
        });
    }

    interpolate(keyframes, easing) {
        if (keyframes.length === 0) return null;
        if (keyframes.length === 1) return keyframes[0].value;

        // Find surrounding keyframes
        let prevKf = keyframes[0];
        let nextKf = keyframes[keyframes.length - 1];

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (this.currentTime >= keyframes[i].time && 
                this.currentTime <= keyframes[i + 1].time) {
                prevKf = keyframes[i];
                nextKf = keyframes[i + 1];
                break;
            }
        }

        if (this.currentTime < prevKf.time) return prevKf.value;
        if (this.currentTime > nextKf.time) return nextKf.value;

        // Calculate interpolation factor
        const duration = nextKf.time - prevKf.time;
        const elapsed = this.currentTime - prevKf.time;
        let t = duration > 0 ? elapsed / duration : 0;

        // Apply easing
        t = this.applyEasing(t, easing);

        // Interpolate
        if (typeof prevKf.value === 'object' && prevKf.value.x !== undefined) {
            return {
                x: this.lerp(prevKf.value.x, nextKf.value.x, t),
                y: this.lerp(prevKf.value.y, nextKf.value.y, t),
                z: this.lerp(prevKf.value.z, nextKf.value.z, t)
            };
        } else {
            return this.lerp(prevKf.value, nextKf.value, t);
        }
    }

    lerp(a, b, t) {
        return a + (b - a) * t;
    }

    applyEasing(t, easing) {
        switch(easing) {
            case 'easeIn':
                return t * t;
            case 'easeOut':
                return t * (2 - t);
            case 'easeInOut':
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            default:
                return t;
        }
    }

    getAnimationTarget(targetId) {
        if (targetId === 'camera' || targetId === 'main') {
            return this.camera;
        }
        
        const obj = this.sceneState.objects.get(targetId);
        return obj ? obj.mesh : null;
    }

    applyValue(target, property, value) {
        if (property === 'position' && value.x !== undefined) {
            target.position.set(value.x, value.y, value.z);
        } else if (property === 'rotation' && value.x !== undefined) {
            target.rotation.set(
                value.x * Math.PI / 180,
                value.y * Math.PI / 180,
                value.z * Math.PI / 180
            );
        } else if (property === 'scale' && value.x !== undefined) {
            target.scale.set(value.x, value.y, value.z);
        } else if (property === 'lookAt' && value.x !== undefined) {
            target.lookAt(value.x, value.y, value.z);
        }
    }

    // ========================================================================
    // RENDER LOOP
    // ========================================================================

    animate = () => {
        requestAnimationFrame(this.animate);

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Update FPS
        this.frameCount++;
        if (currentTime % 500 < deltaTime * 1000) {
            this.fps = Math.round(this.frameCount * 1000 / 500);
            this.frameCount = 0;
        }

        // Update animations
        this.updateAnimations(deltaTime);

        // Render
        this.renderer.render(this.scene, this.camera);

        // Callback
        this.options.onFrame({
            time: this.currentTime,
            duration: this.duration,
            progress: this.getProgress(),
            fps: this.fps
        });
    }
}

// Export for use in modules or browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MotionScriptEngine;
}

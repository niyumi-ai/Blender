// ============================================================================
// MOTIONSCRIPT 3D ANIMATION ENGINE
// A modular, text-driven 3D animation system built with Three.js
// ============================================================================

// ============================================================================
// MODULE 1: ENGINE LAYER
// Handles Three.js scene, camera, renderer, and render loop
// ============================================================================

class Engine {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null; // For post-processing
        this.clock = new THREE.Clock();
        
        this.init();
    }

    init() {
        // Create Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        // Create Camera
        this.camera = new THREE.PerspectiveCamera(
            75, // FOV
            this.canvas.clientWidth / this.canvas.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        // Create Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    setBackground(color) {
        this.scene.background = new THREE.Color(color);
    }

    clear() {
        // Remove all objects from scene except camera
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
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

// ============================================================================
// MODULE 2: SCENE STATE MANAGER
// Single source of truth for all scene data
// ============================================================================

class SceneState {
    constructor() {
        this.reset();
    }

    reset() {
        this.objects = new Map(); // id -> THREE.Object3D
        this.lights = new Map();  // id -> THREE.Light
        this.animations = [];     // Animation definitions
        this.camera = {
            position: { x: 0, y: 5, z: 10 },
            lookAt: { x: 0, y: 0, z: 0 },
            animations: []
        };
        this.settings = {
            duration: 3,
            loop: true,
            background: '#000000',
            bloom: false
        };
    }

    addObject(id, object, definition) {
        this.objects.set(id, { mesh: object, def: definition });
    }

    addLight(id, light, definition) {
        this.lights.set(id, { light: light, def: definition });
    }

    addAnimation(animation) {
        this.animations.push(animation);
    }
}

// ============================================================================
// MODULE 3: COMMAND PARSER
// Converts custom DSL text into structured JavaScript objects
// ============================================================================

class CommandParser {
    constructor() {
        this.commands = {
            scene: {},
            objects: {},
            lights: {},
            camera: {},
            animations: []
        };
    }

    parse(text) {
        this.commands = {
            scene: {},
            objects: {},
            lights: {},
            camera: {},
            animations: []
        };

        try {
            const blocks = this.extractBlocks(text);
            
            blocks.forEach(block => {
                switch(block.type) {
                    case 'scene':
                        this.commands.scene = this.parseProperties(block.content);
                        break;
                    case 'object':
                        this.commands.objects[block.id] = this.parseProperties(block.content);
                        break;
                    case 'light':
                        this.commands.lights[block.id] = this.parseProperties(block.content);
                        break;
                    case 'camera':
                        this.commands.camera = this.parseProperties(block.content);
                        break;
                    case 'animate':
                        this.commands.animations.push(this.parseAnimation(block.id, block.content));
                        break;
                }
            });

            return this.commands;
        } catch (error) {
            throw new Error(`Parse error: ${error.message}`);
        }
    }

    extractBlocks(text) {
        const blocks = [];
        const blockRegex = /(scene|object|light|camera|animate)\s+(\w+)?\s*\{([^}]*)\}/g;
        let match;

        while ((match = blockRegex.exec(text)) !== null) {
            blocks.push({
                type: match[1],
                id: match[2] || 'default',
                content: match[3].trim()
            });
        }

        return blocks;
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
        // Remove comments
        value = value.split('//')[0].trim();

        // Boolean
        if (value === 'true' || value === 'on') return true;
        if (value === 'false' || value === 'off') return false;

        // Number with unit (e.g., "3s")
        if (value.endsWith('s')) {
            return parseFloat(value);
        }

        // Vector (x,y,z)
        if (value.includes(',')) {
            const parts = value.split(',').map(p => parseFloat(p.trim()));
            return { x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 };
        }

        // Number
        if (!isNaN(value)) {
            return parseFloat(value);
        }

        // String (color, type, etc.)
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

            // Parse keyframe: "at 0s -> position: 0,5,0"
            const keyframeMatch = line.match(/at\s+([\d.]+)s\s*->\s*(\w+):\s*(.+)/);
            if (keyframeMatch) {
                const time = parseFloat(keyframeMatch[1]);
                const property = keyframeMatch[2];
                const value = this.parseValue(keyframeMatch[3]);

                animation.keyframes.push({ time, property, value });
            }

            // Parse easing
            if (line.startsWith('easing:')) {
                animation.easing = line.split(':')[1].trim();
            }
        });

        // Sort keyframes by time
        animation.keyframes.sort((a, b) => a.time - b.time);

        return animation;
    }
}

// ============================================================================
// MODULE 4: OBJECT FACTORY
// Creates Three.js objects based on definitions
// ============================================================================

class ObjectFactory {
    static create(type, props = {}) {
        let geometry, material, mesh;

        // Default properties
        const color = props.color || '#ffffff';
        const emissive = props.emissive || '#000000';
        const intensity = props.intensity || 0;
        const metalness = props.metalness || 0.5;
        const roughness = props.roughness || 0.5;

        // Create material
        material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(emissive),
            emissiveIntensity: intensity,
            metalness: metalness,
            roughness: roughness
        });

        // Create geometry based on type
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

        mesh = new THREE.Mesh(geometry, material);

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

        // Enable shadows
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    static createLight(type, props = {}) {
        let light;

        const color = props.color || '#ffffff';
        const intensity = props.intensity || 1;

        switch(type) {
            case 'directional':
                light = new THREE.DirectionalLight(new THREE.Color(color), intensity);
                light.castShadow = props.shadow !== false;
                light.shadow.mapSize.width = 2048;
                light.shadow.mapSize.height = 2048;
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
}

// ============================================================================
// MODULE 5: ANIMATION ENGINE
// Keyframe-based animation with easing functions
// ============================================================================

class AnimationEngine {
    constructor() {
        this.currentTime = 0;
        this.duration = 3;
        this.isPlaying = false;
        this.loop = true;
        this.animations = [];
        this.objects = new Map();
        this.camera = null;
    }

    setAnimations(animations, objects, camera) {
        this.animations = animations;
        this.objects = objects;
        this.camera = camera;
    }

    setDuration(duration) {
        this.duration = duration;
    }

    setLoop(loop) {
        this.loop = loop;
    }

    play() {
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
    }

    reset() {
        this.currentTime = 0;
        this.isPlaying = false;
    }

    seek(time) {
        this.currentTime = Math.max(0, Math.min(time, this.duration));
    }

    update(deltaTime) {
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

        // Update all animations
        this.animations.forEach(anim => {
            this.updateAnimation(anim);
        });
    }

    updateAnimation(animation) {
        const target = this.getTarget(animation.target);
        if (!target) return;

        // Group keyframes by property
        const properties = {};
        animation.keyframes.forEach(kf => {
            if (!properties[kf.property]) {
                properties[kf.property] = [];
            }
            properties[kf.property].push(kf);
        });

        // Interpolate each property
        Object.keys(properties).forEach(propName => {
            const keyframes = properties[propName];
            const value = this.interpolateProperty(keyframes, animation.easing);
            
            if (value !== null) {
                this.applyValue(target, propName, value);
            }
        });
    }

    interpolateProperty(keyframes, easing) {
        if (keyframes.length === 0) return null;
        if (keyframes.length === 1) return keyframes[0].value;

        // Find surrounding keyframes
        let prevKf = keyframes[0];
        let nextKf = keyframes[keyframes.length - 1];

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (this.currentTime >= keyframes[i].time && this.currentTime <= keyframes[i + 1].time) {
                prevKf = keyframes[i];
                nextKf = keyframes[i + 1];
                break;
            }
        }

        // If before first or after last keyframe
        if (this.currentTime < prevKf.time) return prevKf.value;
        if (this.currentTime > nextKf.time) return nextKf.value;

        // Calculate interpolation factor
        const duration = nextKf.time - prevKf.time;
        const elapsed = this.currentTime - prevKf.time;
        let t = duration > 0 ? elapsed / duration : 0;

        // Apply easing
        t = this.applyEasing(t, easing);

        // Interpolate based on value type
        if (typeof prevKf.value === 'object' && prevKf.value.x !== undefined) {
            // Vector interpolation
            return {
                x: this.lerp(prevKf.value.x, nextKf.value.x, t),
                y: this.lerp(prevKf.value.y, nextKf.value.y, t),
                z: this.lerp(prevKf.value.z, nextKf.value.z, t)
            };
        } else {
            // Scalar interpolation
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
            case 'linear':
            default:
                return t;
        }
    }

    getTarget(targetId) {
        if (targetId === 'camera' || targetId === 'main') {
            return this.camera;
        }
        
        const obj = this.objects.get(targetId);
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
}

// ============================================================================
// MODULE 6: RENDERER CONTROLLER
// Manages playback, timeline, and rendering
// ============================================================================

class RendererController {
    constructor(engine, animationEngine) {
        this.engine = engine;
        this.animationEngine = animationEngine;
        this.isRunning = false;
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fpsUpdateInterval = 500; // Update FPS every 500ms
        this.lastFpsUpdate = this.lastTime;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.animate();
    }

    stop() {
        this.isRunning = false;
    }

    animate = () => {
        if (!this.isRunning) return;

        requestAnimationFrame(this.animate);

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        // Update FPS
        this.frameCount++;
        if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
        }

        // Update animation
        this.animationEngine.update(deltaTime);

        // Render scene
        this.engine.render();
    }

    getFPS() {
        return this.fps;
    }
}

// ============================================================================
// MODULE 7: RECORDING SYSTEM
// Video export using MediaRecorder API
// ============================================================================

class RecordingSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.stream = null;
    }

    startRecording(fps = 30) {
        try {
            // Get canvas stream
            this.stream = this.canvas.captureStream(fps);
            
            // Create media recorder
            const options = { mimeType: 'video/webm;codecs=vp9' };
            this.mediaRecorder = new MediaRecorder(this.stream, options);

            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.saveRecording();
            };

            this.mediaRecorder.start();
            this.isRecording = true;

            return true;
        } catch (error) {
            console.error('Recording error:', error);
            return false;
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
    }

    saveRecording() {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `animation_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }
}

// ============================================================================
// MODULE 8: APPLICATION CONTROLLER
// Main application logic and UI integration
// ============================================================================

class App {
    constructor() {
        this.engine = null;
        this.sceneState = null;
        this.parser = null;
        this.animationEngine = null;
        this.rendererController = null;
        this.recordingSystem = null;
        
        this.initializeComponents();
        this.setupUI();
        this.loadDefaultExample();
    }

    initializeComponents() {
        const canvas = document.getElementById('renderCanvas');
        
        this.engine = new Engine(canvas);
        this.sceneState = new SceneState();
        this.parser = new CommandParser();
        this.animationEngine = new AnimationEngine();
        this.rendererController = new RendererController(this.engine, this.animationEngine);
        this.recordingSystem = new RecordingSystem(canvas);
    }

    setupUI() {
        // Editor
        const editor = document.getElementById('codeEditor');
        const lineNumbers = document.getElementById('lineNumbers');
        
        editor.addEventListener('input', () => {
            this.updateLineNumbers();
        });
        
        editor.addEventListener('scroll', () => {
            lineNumbers.scrollTop = editor.scrollTop;
        });

        // Buttons
        document.getElementById('parseBtn').addEventListener('click', () => this.parseAndRender());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearEditor());
        
        document.getElementById('playBtn').addEventListener('click', () => this.play());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        
        // Timeline
        const timelineSeek = document.getElementById('timelineSeek');
        timelineSeek.addEventListener('input', (e) => {
            const progress = parseFloat(e.target.value) / 100;
            this.animationEngine.seek(progress * this.animationEngine.duration);
        });

        // Examples
        document.querySelectorAll('.example-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const example = e.target.dataset.example;
                this.loadExample(example);
            });
        });

        // Console
        document.getElementById('consoleClose').addEventListener('click', () => {
            this.hideConsole();
        });

        // Start FPS counter
        setInterval(() => this.updateFPS(), 100);
        
        // Start timeline updater
        setInterval(() => this.updateTimeline(), 50);
    }

    updateLineNumbers() {
        const editor = document.getElementById('codeEditor');
        const lineNumbers = document.getElementById('lineNumbers');
        const lines = editor.value.split('\n').length;
        
        lineNumbers.innerHTML = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    }

    parseAndRender() {
        const code = document.getElementById('codeEditor').value;
        
        try {
            // Parse commands
            const commands = this.parser.parse(code);
            
            // Clear existing scene
            this.engine.clear();
            this.sceneState.reset();
            
            // Apply scene settings
            if (commands.scene.background) {
                this.engine.setBackground(commands.scene.background);
                this.sceneState.settings.background = commands.scene.background;
            }
            if (commands.scene.duration !== undefined) {
                this.sceneState.settings.duration = commands.scene.duration;
                this.animationEngine.setDuration(commands.scene.duration);
            }
            if (commands.scene.loop !== undefined) {
                this.sceneState.settings.loop = commands.scene.loop;
                this.animationEngine.setLoop(commands.scene.loop);
            }
            
            // Create objects
            Object.keys(commands.objects).forEach(id => {
                const objDef = commands.objects[id];
                const mesh = ObjectFactory.create(objDef.type, objDef);
                this.engine.scene.add(mesh);
                this.sceneState.addObject(id, mesh, objDef);
            });
            
            // Create lights
            Object.keys(commands.lights).forEach(id => {
                const lightDef = commands.lights[id];
                const light = ObjectFactory.createLight(lightDef.type, lightDef);
                this.engine.scene.add(light);
                this.sceneState.addLight(id, light, lightDef);
            });
            
            // Set camera
            if (commands.camera.position) {
                const pos = commands.camera.position;
                this.engine.camera.position.set(pos.x, pos.y, pos.z);
            }
            if (commands.camera.lookAt) {
                const look = commands.camera.lookAt;
                this.engine.camera.lookAt(look.x, look.y, look.z);
            }
            
            // Setup animations
            this.animationEngine.setAnimations(
                commands.animations,
                this.sceneState.objects,
                this.engine.camera
            );
            
            // Start renderer
            this.rendererController.start();
            
            // Hide overlay
            document.getElementById('canvasOverlay').classList.add('hidden');
            
            // Auto-play
            this.play();
            
            this.showConsole('success', 'Scene parsed and rendered successfully!');
            
        } catch (error) {
            this.showConsole('error', error.message);
        }
    }

    play() {
        this.animationEngine.play();
        document.getElementById('playBtn').classList.add('active');
        document.getElementById('pauseBtn').classList.remove('active');
    }

    pause() {
        this.animationEngine.pause();
        document.getElementById('playBtn').classList.remove('active');
        document.getElementById('pauseBtn').classList.add('active');
    }

    reset() {
        this.animationEngine.reset();
        this.animationEngine.pause();
        document.getElementById('playBtn').classList.remove('active');
        document.getElementById('pauseBtn').classList.remove('active');
    }

    toggleRecording() {
        const btn = document.getElementById('recordBtn');
        
        if (!this.recordingSystem.isRecording) {
            // Start recording
            this.reset();
            this.animationEngine.setLoop(false);
            
            setTimeout(() => {
                this.recordingSystem.startRecording(30);
                this.play();
                btn.classList.add('recording');
                
                // Auto-stop after duration
                setTimeout(() => {
                    this.stopRecording();
                }, this.animationEngine.duration * 1000 + 500);
            }, 100);
            
        } else {
            this.stopRecording();
        }
    }

    stopRecording() {
        this.recordingSystem.stopRecording();
        document.getElementById('recordBtn').classList.remove('recording');
        this.showConsole('success', 'Recording saved!');
    }

    updateFPS() {
        const fps = this.rendererController.getFPS();
        document.getElementById('fpsCounter').textContent = `${fps} FPS`;
    }

    updateTimeline() {
        const progress = (this.animationEngine.currentTime / this.animationEngine.duration) * 100;
        document.getElementById('timelineProgress').style.width = `${progress}%`;
        document.getElementById('timelineSeek').value = progress;
        
        const current = this.animationEngine.currentTime.toFixed(1);
        const total = this.animationEngine.duration.toFixed(1);
        document.getElementById('timeDisplay').textContent = `${current}s / ${total}s`;
    }

    clearEditor() {
        document.getElementById('codeEditor').value = '';
        this.updateLineNumbers();
    }

    loadExample(type) {
        let code = '';
        
        switch(type) {
            case 'bouncing':
                code = EXAMPLES.bouncingBall;
                break;
            case 'cubes':
                code = EXAMPLES.rotatingCubes;
                break;
            case 'cinematic':
                code = EXAMPLES.cinematicCamera;
                break;
        }
        
        document.getElementById('codeEditor').value = code;
        this.updateLineNumbers();
        setTimeout(() => this.parseAndRender(), 100);
    }

    loadDefaultExample() {
        this.loadExample('bouncing');
    }

    showConsole(type, message) {
        const consolePanel = document.getElementById('consolePanel');
        const consoleContent = document.getElementById('consoleContent');
        
        const messageEl = document.createElement('div');
        messageEl.className = `console-message ${type}`;
        messageEl.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        
        consoleContent.appendChild(messageEl);
        consolePanel.classList.add('visible');
        
        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => this.hideConsole(), 5000);
        }
    }

    hideConsole() {
        document.getElementById('consolePanel').classList.remove('visible');
    }
}

// ============================================================================
// EXAMPLE SCENES
// ============================================================================

const EXAMPLES = {
    bouncingBall: `scene {
    duration: 3s
    loop: true
    background: #0a0e14
}

object ball {
    type: sphere
    position: 0,5,0
    scale: 1,1,1
    color: #ff00ff
    emissive: #ff00ff
    intensity: 3
    roughness: 0.2
    metalness: 0.8
}

light sun {
    type: directional
    position: 5,10,5
    intensity: 1.5
    color: #ffffff
}

light ambient {
    type: ambient
    intensity: 0.3
    color: #4488ff
}

camera main {
    position: 0,5,10
    lookAt: 0,3,0
}

animate ball {
    at 0s -> position: 0,5,0
    at 0.5s -> position: 0,1,0
    at 1s -> position: 0,5,0
    at 1.5s -> position: 0,1,0
    at 2s -> position: 0,5,0
    at 2.5s -> position: 0,1,0
    at 3s -> position: 0,5,0
    easing: easeInOut
}

animate ball {
    at 0s -> scale: 1,1,1
    at 0.5s -> scale: 1.2,0.8,1.2
    at 1s -> scale: 1,1,1
    at 1.5s -> scale: 1.2,0.8,1.2
    at 2s -> scale: 1,1,1
    at 2.5s -> scale: 1.2,0.8,1.2
    at 3s -> scale: 1,1,1
    easing: easeInOut
}`,

    rotatingCubes: `scene {
    duration: 4s
    loop: true
    background: #000000
}

object cube1 {
    type: cube
    position: -2,0,0
    color: #00d9ff
    emissive: #00d9ff
    intensity: 2
}

object cube2 {
    type: cube
    position: 0,0,0
    color: #ff0080
    emissive: #ff0080
    intensity: 2
}

object cube3 {
    type: cube
    position: 2,0,0
    color: #7c3aed
    emissive: #7c3aed
    intensity: 2
}

light main {
    type: directional
    position: 5,10,5
    intensity: 1
}

camera main {
    position: 0,3,8
    lookAt: 0,0,0
}

animate cube1 {
    at 0s -> rotation: 0,0,0
    at 4s -> rotation: 360,360,0
    easing: linear
}

animate cube2 {
    at 0s -> rotation: 0,0,0
    at 4s -> rotation: 0,360,360
    easing: linear
}

animate cube3 {
    at 0s -> rotation: 0,0,0
    at 4s -> rotation: 360,0,360
    easing: linear
}`,

    cinematicCamera: `scene {
    duration: 5s
    loop: true
    background: #050510
}

object sphere {
    type: sphere
    position: 0,2,0
    scale: 2,2,2
    color: #ffffff
    emissive: #00ffaa
    intensity: 1.5
    metalness: 0.9
    roughness: 0.1
}

object ground {
    type: plane
    position: 0,0,0
    rotation: -90,0,0
    scale: 20,20,1
    color: #222222
    roughness: 0.8
}

light key {
    type: directional
    position: 8,10,5
    intensity: 2
    color: #ffffff
}

light fill {
    type: point
    position: -5,3,2
    intensity: 1
    color: #ff6600
}

light ambient {
    type: ambient
    intensity: 0.2
}

camera main {
    position: 10,5,10
    lookAt: 0,2,0
}

animate main {
    at 0s -> position: 10,5,10
    at 2.5s -> position: -10,5,10
    at 5s -> position: 10,5,10
    easing: easeInOut
}

animate sphere {
    at 0s -> rotation: 0,0,0
    at 5s -> rotation: 0,360,0
    easing: linear
}`
};

// ============================================================================
// INITIALIZE APPLICATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    new App();
});

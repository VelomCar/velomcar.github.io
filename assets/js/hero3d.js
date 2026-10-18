/* =========================================================
   VELOM — Hero mobil 3D realistis (three.js, PBR + clearcoat)
   - Seret untuk memutar 360°
   - Kamera mengorbit mengikuti scroll
   - Kecepatan scroll = roda berputar & lantai bergerak
   - Warna cat berubah mengikuti unit di garasi
   ========================================================= */
(function () {
  "use strict";
  var canvas = document.getElementById("car3d");
  if (!canvas) return;
  var cfg = window.VELOM_CONFIG || {};

  var api = window.VelomHero = {
    progress: 0, speed: 0, paint: "#16171a", failed: false, loaded: false,
    onLoad: null, onLoadProgress: null,
    setPaint: function (hex) { api.paint = hex; },
    setProgress: function (p) { api.progress = p; },
    setSpeed: function (v) { api.speed = v; }
  };

  function fail(err) {
    if (err) console.warn("[VELOM] 3D tidak tersedia:", err);
    api.failed = true;
    document.documentElement.classList.add("no-webgl");
    if (api.onLoad) api.onLoad(false);
  }

  try {
    var test = document.createElement("canvas");
    if (!test.getContext("webgl2")) return fail("WebGL2 tidak didukung");
  } catch (e) { return fail(e); }

  Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
    import("three/addons/environments/RoomEnvironment.js")
  ]).then(function (mods) {
    init(mods[0], mods[1].GLTFLoader, mods[2].DRACOLoader, mods[3].RoomEnvironment);
  }).catch(fail);

  function init(THREE, GLTFLoader, DRACOLoader, RoomEnvironment) {
    var mobile = matchMedia("(max-width: 760px)").matches;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.fog = new THREE.Fog(0x050506, 10, 20);

    var camera = new THREE.PerspectiveCamera(mobile ? 42 : 34, 1, 0.1, 100);

    // lantai grid "aspal"
    var grid = new THREE.GridHelper(60, 120, 0xffffff, 0xffffff);
    grid.material.opacity = 0.07;
    grid.material.depthWrite = false;
    grid.material.transparent = true;
    scene.add(grid);

    // cahaya merah di bawah mobil
    var gc = document.createElement("canvas"); gc.width = gc.height = 256;
    var g2 = gc.getContext("2d");
    var rg = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, "rgba(255,70,30,0.55)"); rg.addColorStop(0.5, "rgba(255,40,20,0.12)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    g2.fillStyle = rg; g2.fillRect(0, 0, 256, 256);
    var glow = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.002;
    scene.add(glow);

    // material realistis (cat metalik + clearcoat seperti mobil asli)
    var bodyMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(api.paint), metalness: 1.0, roughness: 0.42,
      clearcoat: 1.0, clearcoatRoughness: 0.03
    });
    var detailMat = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1.0, roughness: 0.35 });
    var glassMat = mobile
      ? new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.4, roughness: 0, transparent: true, opacity: 0.55 })
      : new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.25, roughness: 0, transmission: 1.0 });

    var car = null, wheels = [], pivot = new THREE.Group();
    scene.add(pivot);

    var draco = new DRACOLoader();
    draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");
    var loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    var shadowTex = new THREE.TextureLoader().load(cfg.model3dShadow || "");

    loader.load(cfg.model3d, function (gltf) {
      car = gltf.scene.children[0];
      var set = function (name, mat) { var o = car.getObjectByName(name); if (o) o.material = mat; };
      set("body", bodyMat);
      ["rim_fl", "rim_fr", "rim_rr", "rim_rl", "trim"].forEach(function (n) { set(n, detailMat); });
      set("glass", glassMat);
      ["wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"].forEach(function (n) {
        var w = car.getObjectByName(n); if (w) wheels.push(w);
      });
      var shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4),
        new THREE.MeshBasicMaterial({ map: shadowTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 2;
      car.add(shadow);
      pivot.add(car);
      api.loaded = true;
      canvas.classList.add("is-ready");
      if (api.onLoad) api.onLoad(true);
    }, function (xhr) {
      if (api.onLoadProgress && xhr.total) api.onLoadProgress(xhr.loaded / xhr.total);
    }, fail);

    // ---------- interaksi seret ----------
    var yaw = 0, yawVel = 0, dragging = false, lastX = 0, mx = 0, my = 0, smx = 0, smy = 0;
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; lastX = e.clientX; yawVel = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX; lastX = e.clientX;
      yawVel = dx * 0.006; yaw += yawVel;
    });
    var end = function () { dragging = false; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    window.addEventListener("pointermove", function (e) {
      mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });

    // ---------- ukuran ----------
    var W = 0, H = 0, dist = 9;
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      var vf = camera.fov * Math.PI / 180;
      var hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      var byW = (mobile ? 2.75 : 3.9) / Math.tan(hf / 2), byH = (mobile ? 1.6 : 2.3) / Math.tan(vf / 2);
      dist = Math.max(byW, byH, 6.2);
      scene.fog.near = dist - 1; scene.fog.far = dist + 14;
      if (mobile) camera.setViewOffset(W, H, 0, H * 0.1, W, H);
      else camera.setViewOffset(W, H, -W * 0.16, -H * 0.04, W, H);
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    // ---------- loop ----------
    var visible = true, travel = 0, last = performance.now(), cur = new THREE.Color(api.paint), tgt = new THREE.Color();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(canvas);
    }
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible || document.hidden) return;
      if (!W) resize();

      if (!dragging) { yaw += yawVel; yawVel *= 0.94; }
      smx += (mx - smx) * 0.05; smy += (my - smy) * 0.05;

      var p = api.progress;
      var theta = 2.35 + p * Math.PI * 1.7 + yaw + smx * 0.25;
      var r = dist * (1 - 0.16 * Math.sin(p * Math.PI));
      var h = 1.45 - p * 0.75 + smy * 0.4;
      camera.position.set(Math.sin(theta) * r, h, Math.cos(theta) * r);
      camera.lookAt(0, 0.45, 0);

      // scroll = gas
      var sp = Math.min(1, Math.abs(api.speed));
      travel += sp * dt * 9;
      grid.position.z = -(travel % 0.5);
      wheels.forEach(function (w) { w.rotation.x = -travel * 2.4; });
      if (car) car.position.y = Math.sin(now / 90) * 0.004 * sp;

      tgt.set(api.paint); cur.lerp(tgt, 0.045); bodyMat.color.copy(cur);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }
})();

/* ==========================================================================
   Procedural Fireplace Render Engine (HTML5 Canvas)
   ========================================================================== */

class FireParticle {
  constructor(x, y, intensity) {
    this.x = x + (Math.random() * 40 - 20);
    this.y = y + (Math.random() * 10 - 5);
    
    // Scale flame speed and size based on fireplace heat
    const scale = intensity / 100;
    
    this.vx = (Math.random() * 1.2 - 0.6);
    this.vy = -(Math.random() * 2.5 + 1.5) * (0.6 + scale * 0.4);
    
    this.radius = (Math.random() * 22 + 10) * (0.5 + scale * 0.5);
    this.maxLife = (Math.random() * 30 + 25) * (0.6 + scale * 0.4);
    this.life = this.maxLife;
    
    // Color temperature gradient
    this.colorType = Math.random();
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    
    // Flame shrinks as it rises
    if (this.radius > 0.5) {
      this.radius -= 0.35;
    }
  }

  draw(ctx) {
    const lifeRatio = this.life / this.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // Flame color palette based on life cycle
    let color;
    if (this.colorType < 0.45) {
      // Core Bright Yellow
      color = `rgba(255, ${Math.floor(180 + 75 * lifeRatio)}, ${Math.floor(50 * lifeRatio)}, ${lifeRatio * 0.75})`;
    } else if (this.colorType < 0.85) {
      // Warm Orange
      color = `rgba(249, ${Math.floor(115 * lifeRatio)}, 22, ${lifeRatio * 0.6})`;
    } else {
      // Outer Deep Red
      color = `rgba(220, 38, 38, ${lifeRatio * 0.45})`;
    }

    // Draw glowing fire ball
    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.radius
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class SparkParticle {
  constructor(x, y, intensity) {
    this.x = x + (Math.random() * 80 - 40);
    this.y = y - 10;
    this.vx = (Math.random() * 2 - 1);
    this.vy = -(Math.random() * 3 + 2);
    this.radius = Math.random() * 2 + 1;
    this.maxLife = Math.random() * 60 + 40;
    this.life = this.maxLife;
    this.swingSpeed = Math.random() * 0.1 + 0.05;
    this.swingWidth = Math.random() * 1.5;
  }

  update() {
    this.x += this.vx + Math.sin(this.life * this.swingSpeed) * this.swingWidth;
    this.y += this.vy;
    this.life--;
  }

  draw(ctx) {
    const lifeRatio = this.life / this.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // Spark turns from bright yellow to red-orange
    ctx.fillStyle = `rgba(255, ${Math.floor(150 + 105 * lifeRatio)}, 50, ${lifeRatio * 0.9})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class SmokeParticle {
  constructor(x, y) {
    this.x = x + (Math.random() * 100 - 50);
    this.y = y - 40;
    this.vx = (Math.random() * 0.8 - 0.4);
    this.vy = -(Math.random() * 1 + 0.8);
    this.radius = Math.random() * 30 + 20;
    this.maxLife = Math.random() * 80 + 60;
    this.life = this.maxLife;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    this.radius += 0.15; // Smoke expands
  }

  draw(ctx) {
    const lifeRatio = this.life / this.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    
    // Very faint dark grey smoke
    ctx.fillStyle = `rgba(25, 20, 18, ${lifeRatio * 0.12 * (1 - lifeRatio)})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class FireplaceRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    this.flames = [];
    this.sparks = [];
    this.smoke = [];
    
    this.animationFrameId = null;
    this.fireplaceLogs = []; // local view of logs
    this.intensity = 50;     // local fire intensity
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    // Fireplace inner cave dimensions mapping
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  // Sync state from Yjs document
  syncState(logs, intensity) {
    this.fireplaceLogs = logs;
    this.intensity = intensity;
  }

  // Add spark manual burst (e.g. from wood throwing)
  burstSparks(count = 15) {
    const fireCenterX = this.canvas.width / 2;
    const fireBaseY = this.canvas.height - 40;
    for (let i = 0; i < count; i++) {
      this.sparks.push(new SparkParticle(fireCenterX, fireBaseY, this.intensity));
    }
  }

  // Main animation frame loop
  tick() {
    this.update();
    this.draw();
    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  start() {
    if (!this.animationFrameId) {
      this.tick();
    }
  }

  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  update() {
    const fireCenterX = this.canvas.width / 2;
    const fireBaseY = this.canvas.height - 50;
    
    // 1. Spawning Flame Particles (Count scales with fire intensity)
    const flameSpawnRate = Math.max(1, Math.floor(this.intensity / 18));
    for (let i = 0; i < flameSpawnRate; i++) {
      // Spread flames across burning logs width
      const spreadX = fireCenterX;
      this.flames.push(new FireParticle(spreadX, fireBaseY, this.intensity));
    }

    // 2. Spawning Spark Particles
    if (Math.random() < 0.05 + (this.intensity / 500)) {
      this.sparks.push(new SparkParticle(fireCenterX, fireBaseY, this.intensity));
    }

    // 3. Spawning Smoke Particles (Less smoke when burning hot, more when dying)
    const smokeProbability = 0.02 + (1 - this.intensity / 100) * 0.08;
    if (Math.random() < smokeProbability) {
      this.smoke.push(new SmokeParticle(fireCenterX, fireBaseY - 60));
    }

    // Update Arrays
    this.flames.forEach(p => p.update());
    this.sparks.forEach(p => p.update());
    this.smoke.forEach(p => p.update());

    // Filter dead particles
    this.flames = this.flames.filter(p => p.life > 0);
    this.sparks = this.sparks.filter(p => p.life > 0);
    this.smoke = this.smoke.filter(p => p.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const baseY = h - 35;

    // 1. Draw Charcoal Bed (Glowing Embers at Base)
    ctx.save();
    const pulseGlow = 0.8 + Math.sin(Date.now() * 0.003) * 0.2;
    const coalIntensity = this.intensity / 100;
    
    const coalGradient = ctx.createRadialGradient(
      centerX, baseY, 10,
      centerX, baseY, 220
    );
    
    // Glowing coal colors
    const r = Math.floor(180 * coalIntensity * pulseGlow);
    const g = Math.floor(40 * coalIntensity * pulseGlow);
    const b = Math.floor(10 * coalIntensity * pulseGlow);
    
    coalGradient.addColorStop(0, `rgba(${r + 75}, ${g + 30}, ${b}, 0.85)`);
    coalGradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.6)`);
    coalGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = coalGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, baseY, 240, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Draw Firewood Logs (synced logs array)
    this.drawLogs(ctx, centerX, baseY);

    // 3. Draw Flames
    this.flames.forEach(p => p.draw(ctx));

    // 4. Draw Sparks
    this.sparks.forEach(p => p.draw(ctx));

    // 5. Draw Smoke
    this.smoke.forEach(p => p.draw(ctx));
  }

  drawLogs(ctx, centerX, baseY) {
    if (!this.fireplaceLogs || this.fireplaceLogs.length === 0) {
      // Draw a default background starter log if none are online yet
      this.drawSingleLog(ctx, centerX, baseY + 5, 0, 0.2); // charred
      return;
    }

    // Sort logs so older/lower logs render behind
    const sortedLogs = [...this.fireplaceLogs].sort((a, b) => a.addedAt - b.addedAt);

    sortedLogs.forEach((log, index) => {
      // Map index to layout position offsets
      let xOffset = 0;
      let yOffset = 0;
      let angle = 0;
      
      // Position algorithm based on log index to create stack
      if (index === 0) {
        xOffset = -40; yOffset = 5; angle = -0.15;
      } else if (index === 1) {
        xOffset = 40; yOffset = 5; angle = 0.12;
      } else if (index === 2) {
        xOffset = 0; yOffset = -15; angle = 0.03;
      } else if (index === 3) {
        xOffset = -25; yOffset = -25; angle = 0.25;
      } else if (index === 4) {
        xOffset = 25; yOffset = -25; angle = -0.28;
      } else {
        // Higher logs pile in center
        xOffset = (index % 2 === 0 ? 15 : -15) * (index - 4);
        yOffset = -30 - (index - 4) * 8;
        angle = (index % 2 === 0 ? 0.1 : -0.1) * (index - 4);
      }

      this.drawSingleLog(ctx, centerX + xOffset, baseY + yOffset, angle, log.burnProgress || 0);
    });
  }

  drawSingleLog(ctx, x, y, angle, burnProgress) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const logWidth = 140;
    const logHeight = 24;

    // 1. Draw Log Body (charring texture gets blacker, red edge glows as it burns)
    const logGrad = ctx.createLinearGradient(0, -logHeight/2, 0, logHeight/2);
    
    // Colors darken based on burn progress
    const freshWood = ['#5c3a21', '#3d2516', '#26170d'];
    const burntWood = ['#1d1512', '#0a0808', '#000000'];
    
    const c1 = this.blendColors(freshWood[0], burntWood[0], burnProgress);
    const c2 = this.blendColors(freshWood[1], burntWood[1], burnProgress);
    const c3 = this.blendColors(freshWood[2], burntWood[2], burnProgress);

    logGrad.addColorStop(0, c1);
    logGrad.addColorStop(0.5, c2);
    logGrad.addColorStop(1, c3);

    // Glowing outline for burning wood
    ctx.shadowBlur = burnProgress > 0.1 ? 8 * (1 - burnProgress) : 0;
    ctx.shadowColor = `rgba(234, 88, 12, ${0.4 + (1 - burnProgress) * 0.6})`;

    ctx.fillStyle = logGrad;
    ctx.beginPath();
    ctx.roundRect(-logWidth / 2, -logHeight / 2, logWidth, logHeight, 6);
    ctx.fill();

    // 2. Draw Bark Lines (splits)
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.6 + burnProgress * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Horizontal bark creases
    ctx.moveTo(-logWidth/2 + 20, -4);
    ctx.lineTo(logWidth/2 - 20, -4);
    ctx.moveTo(-logWidth/2 + 10, 4);
    ctx.lineTo(logWidth/2 - 30, 4);
    ctx.stroke();

    // 3. Draw End Rings (Tree circular cuts)
    ctx.fillStyle = this.blendColors('#dfb78e', '#291d16', burnProgress);
    ctx.beginPath();
    ctx.ellipse(-logWidth/2 + 3, 0, 4, logHeight/2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120b08';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Burn overlay glow (Glow red hot in center crevices)
    if (burnProgress > 0.05 && burnProgress < 0.95) {
      const emberAlpha = Math.sin(Date.now() * 0.002) * 0.25 + 0.65;
      ctx.fillStyle = `rgba(249, 115, 22, ${emberAlpha * (1 - burnProgress)})`;
      ctx.beginPath();
      // Embers cracks
      ctx.roundRect(-logWidth / 4, -2, logWidth / 2, 4, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Color blending utility (hex to hex)
  blendColors(color1, color2, percentage) {
    const f = parseInt(color1.slice(1), 16),
          t = parseInt(color2.slice(1), 16),
          R1 = f >> 16, G1 = f >> 8 & 0x00FF, B1 = f & 0x0000FF,
          R2 = t >> 16, G2 = t >> 8 & 0x00FF, B2 = t & 0x0000FF;
    return "#" + (0x1000000 + Math.round(R1 + (R2 - R1) * percentage) * 0x10000 + Math.round(G1 + (G2 - G1) * percentage) * 0x100 + Math.round(B1 + (B2 - B1) * percentage)).toString(16).slice(1);
  }
}
export default FireplaceRenderer;

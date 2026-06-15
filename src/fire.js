/* ==========================================================================
   Procedural Fireplace Render Engine (HTML5 Canvas)
   ========================================================================== */

class FireParticle {
  constructor(x, y, intensity) {
    // Spread flame particles horizontally across logs
    this.x = x + (Math.random() * 40 - 20);
    this.y = y + (Math.random() * 10 - 5);
    
    // Minimum scale 0.45 to ensure the fire is always cozy and visible
    const scale = Math.max(0.45, intensity / 100);
    
    this.vx = (Math.random() * 1.4 - 0.7);
    this.vy = -(Math.random() * 3.0 + 2.0) * (0.6 + scale * 0.4);
    
    // Increased particle radius for larger, cozy flames
    this.radius = (Math.random() * 32 + 18) * (0.6 + scale * 0.5);
    this.maxLife = (Math.random() * 35 + 30) * (0.6 + scale * 0.4);
    this.life = this.maxLife;
    
    this.colorType = Math.random();
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    
    if (this.radius > 0.5) {
      this.radius -= 0.3; // Shrink speed
    }
  }

  draw(ctx) {
    const lifeRatio = this.life / this.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    
    // High premium fire color blend (deep crimson -> rich orange -> warm bright yellow)
    let color;
    if (this.colorType < 0.45) {
      // Core Bright Yellow
      color = `rgba(255, ${Math.floor(200 + 55 * lifeRatio)}, ${Math.floor(70 * lifeRatio)}, ${lifeRatio * 0.8})`;
    } else if (this.colorType < 0.85) {
      // Rich Warm Orange
      color = `rgba(249, ${Math.floor(130 * lifeRatio)}, 20, ${lifeRatio * 0.65})`;
    } else {
      // Crimson Outer Glow
      color = `rgba(239, 68, 68, ${lifeRatio * 0.5})`;
    }

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
    this.x = x + (Math.random() * 100 - 50);
    this.y = y - 10;
    this.vx = (Math.random() * 2.2 - 1.1);
    this.vy = -(Math.random() * 3.5 + 2.5);
    this.radius = Math.random() * 2.5 + 1;
    this.maxLife = Math.random() * 70 + 40;
    this.life = this.maxLife;
    this.swingSpeed = Math.random() * 0.12 + 0.05;
    this.swingWidth = Math.random() * 2.0;
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
    
    ctx.fillStyle = `rgba(255, ${Math.floor(160 + 95 * lifeRatio)}, 60, ${lifeRatio * 0.95})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class SmokeParticle {
  constructor(x, y) {
    this.x = x + (Math.random() * 120 - 60);
    this.y = y - 40;
    this.vx = (Math.random() * 1.0 - 0.5);
    this.vy = -(Math.random() * 1.2 + 0.8);
    this.radius = Math.random() * 35 + 25;
    this.maxLife = Math.random() * 90 + 70;
    this.life = this.maxLife;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
    this.radius += 0.18;
  }

  draw(ctx) {
    const lifeRatio = this.life / this.maxLife;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    
    ctx.fillStyle = `rgba(20, 16, 14, ${lifeRatio * 0.14 * (1 - lifeRatio)})`;
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
    this.fireplaceLogs = [];
    this.intensity = 50;
    
    this.updateSize();
    window.addEventListener('resize', () => this.updateSize());
  }

  updateSize() {
    const parent = this.canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
      }
    }
  }

  syncState(logs, intensity) {
    this.fireplaceLogs = logs;
    this.intensity = intensity;
  }

  burstSparks(count = 15) {
    const fireCenterX = this.canvas.width / 2;
    const fireBaseY = this.canvas.height - 40;
    for (let i = 0; i < count; i++) {
      this.sparks.push(new SparkParticle(fireCenterX, fireBaseY, this.intensity));
    }
  }

  tick() {
    this.updateSize(); // Bulletproof size sync in frame loop
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
    const fireBaseY = this.canvas.height - 40;
    
    // Spawn rate scales, minimum 3 flames for cozy look
    const flameSpawnRate = Math.max(3, Math.floor(this.intensity / 12));
    for (let i = 0; i < flameSpawnRate; i++) {
      const spreadX = fireCenterX + (Math.random() * 80 - 40);
      this.flames.push(new FireParticle(spreadX, fireBaseY, this.intensity));
    }

    if (Math.random() < 0.07 + (this.intensity / 400)) {
      this.sparks.push(new SparkParticle(fireCenterX, fireBaseY, this.intensity));
    }

    const smokeProbability = 0.02 + (1 - this.intensity / 100) * 0.08;
    if (Math.random() < smokeProbability) {
      this.smoke.push(new SmokeParticle(fireCenterX, fireBaseY - 50));
    }

    this.flames.forEach(p => p.update());
    this.sparks.forEach(p => p.update());
    this.smoke.forEach(p => p.update());

    this.flames = this.flames.filter(p => p.life > 0);
    this.sparks = this.sparks.filter(p => p.life > 0);
    this.smoke = this.smoke.filter(p => p.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const baseY = h - 35;

    // 1. Draw Charcoal Bed
    ctx.save();
    const pulseGlow = 0.8 + Math.sin(Date.now() * 0.003) * 0.2;
    const coalIntensity = Math.max(0.4, this.intensity / 100);
    
    const coalGradient = ctx.createRadialGradient(
      centerX, baseY, 10,
      centerX, baseY, 220
    );
    
    const r = Math.floor(180 * coalIntensity * pulseGlow);
    const g = Math.floor(50 * coalIntensity * pulseGlow);
    const b = Math.floor(15 * coalIntensity * pulseGlow);
    
    coalGradient.addColorStop(0, `rgba(${r + 75}, ${g + 30}, ${b}, 0.85)`);
    coalGradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, 0.6)`);
    coalGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = coalGradient;
    ctx.beginPath();
    ctx.ellipse(centerX, baseY, 240, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Draw Logs
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
      // Default cozy starter stack of 3 logs (stacked beautifully)
      this.drawSingleLog(ctx, centerX - 35, baseY + 6, -0.12, 0.25);
      this.drawSingleLog(ctx, centerX + 35, baseY + 6, 0.08, 0.2);
      this.drawSingleLog(ctx, centerX, baseY - 8, 0.02, 0.15);
      return;
    }

    const sortedLogs = [...this.fireplaceLogs].sort((a, b) => a.addedAt - b.addedAt);

    sortedLogs.forEach((log, index) => {
      let xOffset = 0;
      let yOffset = 0;
      let angle = 0;
      
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

    const logGrad = ctx.createLinearGradient(0, -logHeight/2, 0, logHeight/2);
    
    const freshWood = ['#5c3a21', '#3d2516', '#26170d'];
    const burntWood = ['#1d1512', '#0a0808', '#000000'];
    
    const c1 = this.blendColors(freshWood[0], burntWood[0], burnProgress);
    const c2 = this.blendColors(freshWood[1], burntWood[1], burnProgress);
    const c3 = this.blendColors(freshWood[2], burntWood[2], burnProgress);

    logGrad.addColorStop(0, c1);
    logGrad.addColorStop(0.5, c2);
    logGrad.addColorStop(1, c3);

    ctx.shadowBlur = burnProgress > 0.1 ? 8 * (1 - burnProgress) : 0;
    ctx.shadowColor = `rgba(234, 88, 12, ${0.4 + (1 - burnProgress) * 0.6})`;

    ctx.fillStyle = logGrad;
    ctx.beginPath();
    ctx.roundRect(-logWidth / 2, -logHeight / 2, logWidth, logHeight, 6);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.6 + burnProgress * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-logWidth/2 + 20, -4);
    ctx.lineTo(logWidth/2 - 20, -4);
    ctx.moveTo(-logWidth/2 + 10, 4);
    ctx.lineTo(logWidth/2 - 30, 4);
    ctx.stroke();

    ctx.fillStyle = this.blendColors('#dfb78e', '#291d16', burnProgress);
    ctx.beginPath();
    ctx.ellipse(-logWidth/2 + 3, 0, 4, logHeight/2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120b08';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (burnProgress > 0.05 && burnProgress < 0.95) {
      const emberAlpha = Math.sin(Date.now() * 0.002) * 0.25 + 0.65;
      ctx.fillStyle = `rgba(249, 115, 22, ${emberAlpha * (1 - burnProgress)})`;
      ctx.beginPath();
      ctx.roundRect(-logWidth / 4, -2, logWidth / 2, 4, 2);
      ctx.fill();
    }

    ctx.restore();
  }

  blendColors(color1, color2, percentage) {
    const f = parseInt(color1.slice(1), 16),
          t = parseInt(color2.slice(1), 16),
          R1 = f >> 16, G1 = f >> 8 & 0x00FF, B1 = f & 0x0000FF,
          R2 = t >> 16, G2 = t >> 8 & 0x00FF, B2 = t & 0x0000FF;
    return "#" + (0x1000000 + Math.round(R1 + (R2 - R1) * percentage) * 0x10000 + Math.round(G1 + (G2 - G1) * percentage) * 0x100 + Math.round(B1 + (B2 - B1) * percentage)).toString(16).slice(1);
  }
}
export default FireplaceRenderer;

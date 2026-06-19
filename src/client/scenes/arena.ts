import * as Phaser from 'phaser';
import type { Argument, Side, Tally } from '../../shared/api';

// The arena is the Phaser centerpiece — sky, ground, rope, two cartoon teams,
// and a center marker that slides toward the winning side as upvotes pour in.

export type ArenaLayout = {
  width: number;
  height: number;
  groundY: number;
  ropeY: number;
  ropeLeftX: number;
  ropeRightX: number;
};

export type FighterAnnotations = {
  yourArgId: string | null;
  mvpLeftArgId: string | null;
  mvpRightArgId: string | null;
};

export const computeArenaLayout = (
  width: number,
  height: number
): ArenaLayout => {
  const groundY = Math.round(height * 0.78);
  const ropeY = groundY - 4;
  const ropeLeftX = Math.round(width * 0.08);
  const ropeRightX = Math.round(width * 0.92);
  return { width, height, groundY, ropeY, ropeLeftX, ropeRightX };
};

const TEAM_COLORS: Record<Side, { primary: number; accent: number }> = {
  left: { primary: 0xd11b1b, accent: 0xffd1d1 },
  right: { primary: 0x2156c4, accent: 0xc8d9ff },
};

const SKIN_TONES = [0xf2c79a, 0xd9a172, 0xa1683c, 0x6b3f1a, 0xefd2b8];
const HAIR_COLORS = [0x2b1a0a, 0x6b3f1a, 0xc7a25a, 0x222222, 0xe26a2c, 0xf2e0a0];

type Accessory = 'none' | 'beanie' | 'cap' | 'tophat' | 'headband' | 'bandana';
type FaceMark = 'none' | 'glasses' | 'shades' | 'mustache' | 'beard';

const seededRandom = (seed: string): (() => number) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10_000) / 10_000;
  };
};

const pickFrom = <T>(rng: () => number, arr: ReadonlyArray<T>): T =>
  arr[Math.floor(rng() * arr.length)]!;

export class Arena {
  private scene: Phaser.Scene;
  private layout: ArenaLayout;
  private bgGraphics: Phaser.GameObjects.Graphics;
  private groundGraphics: Phaser.GameObjects.Graphics;
  private ropeGraphics: Phaser.GameObjects.Graphics;
  private fightersLayer: Phaser.GameObjects.Container;
  private effectsLayer: Phaser.GameObjects.Container;
  private marker: Phaser.GameObjects.Container;
  private markerTargetX = 0;
  private leftLabelText: Phaser.GameObjects.Text;
  private rightLabelText: Phaser.GameObjects.Text;
  private leftPowerText: Phaser.GameObjects.Text;
  private rightPowerText: Phaser.GameObjects.Text;
  private fightersById = new Map<string, Phaser.GameObjects.Container>();
  private annotations: FighterAnnotations = {
    yourArgId: null,
    mvpLeftArgId: null,
    mvpRightArgId: null,
  };
  private orderedIds: string[] = [];
  private argLookupCache = new Map<string, Argument>();

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;
    this.layout = computeArenaLayout(width, height);
    this.bgGraphics = scene.add.graphics();
    this.groundGraphics = scene.add.graphics();
    this.ropeGraphics = scene.add.graphics();
    this.fightersLayer = scene.add.container(0, 0);
    this.effectsLayer = scene.add.container(0, 0);

    this.leftLabelText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0, 0);
    this.rightLabelText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(1, 0);
    this.leftPowerText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '16px',
        color: '#ffd1d1',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0, 0);
    this.rightPowerText = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '16px',
        color: '#c8d9ff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1, 0);

    this.marker = this.buildMarker();

    this.drawBackground();
    this.drawGround();
    this.drawRope();
    this.positionLabels();
    scene.events.on(Phaser.Scenes.Events.UPDATE, () => this.tickMarker());
  }

  resize(width: number, height: number): void {
    this.layout = computeArenaLayout(width, height);
    this.drawBackground();
    this.drawGround();
    this.drawRope();
    this.positionLabels();
    this.relayoutFighters();
  }

  // ---------- Drawing ----------
  private drawBackground(): void {
    const g = this.bgGraphics;
    g.clear();
    const { width, height } = this.layout;
    const bands = [
      { color: 0xf6c878, ratio: 0.35 },
      { color: 0xea8a52, ratio: 0.65 },
      { color: 0x9b4a7a, ratio: 1.0 },
    ];
    let y = 0;
    let prev = 0;
    for (const b of bands) {
      const next = Math.round(height * b.ratio);
      g.fillStyle(b.color, 1);
      g.fillRect(0, y, width, next - prev);
      y = next;
      prev = next;
    }
    g.fillStyle(0xffeeb0, 0.9);
    g.fillCircle(width * 0.78, height * 0.18, Math.min(46, width * 0.08));
    g.fillStyle(0xffeeb0, 0.3);
    g.fillCircle(width * 0.78, height * 0.18, Math.min(72, width * 0.13));
    g.fillStyle(0xffffff, 0.7);
    const clouds = [
      { x: 0.15, y: 0.18, r: 22 },
      { x: 0.40, y: 0.10, r: 18 },
      { x: 0.62, y: 0.22, r: 26 },
    ];
    for (const c of clouds) {
      const cx = width * c.x;
      const cy = height * c.y;
      g.fillCircle(cx, cy, c.r);
      g.fillCircle(cx + c.r * 0.8, cy + 4, c.r * 0.8);
      g.fillCircle(cx - c.r * 0.7, cy + 6, c.r * 0.7);
    }
    // Distant mountains.
    g.fillStyle(0x5b2e54, 0.7);
    g.beginPath();
    g.moveTo(0, height * 0.6);
    g.lineTo(width * 0.18, height * 0.46);
    g.lineTo(width * 0.32, height * 0.58);
    g.lineTo(width * 0.5, height * 0.42);
    g.lineTo(width * 0.7, height * 0.56);
    g.lineTo(width * 0.86, height * 0.45);
    g.lineTo(width, height * 0.6);
    g.lineTo(width, height * 0.7);
    g.lineTo(0, height * 0.7);
    g.closePath();
    g.fillPath();
  }

  private drawGround(): void {
    const g = this.groundGraphics;
    g.clear();
    const { width, height, groundY } = this.layout;
    g.fillStyle(0x5a3a1f, 1);
    g.fillRect(0, groundY, width, height - groundY);
    g.fillStyle(0x6b4422, 1);
    g.fillRect(0, groundY, width, 10);
    g.fillStyle(0x3d2412, 1);
    g.fillRect(width / 2 - 28, groundY, 56, 8);
    // Subtle ground texture flecks.
    g.fillStyle(0x4a2f1a, 0.55);
    for (let i = 0; i < 30; i++) {
      const x = (i / 30) * width + ((i * 37) % 17);
      const y = groundY + 14 + ((i * 19) % (height - groundY - 18));
      g.fillRect(x, y, 3, 2);
    }
  }

  private drawRope(): void {
    const g = this.ropeGraphics;
    g.clear();
    const { ropeY, ropeLeftX, ropeRightX } = this.layout;
    g.lineStyle(8, 0x4a2f12, 1);
    g.lineBetween(ropeLeftX, ropeY, ropeRightX, ropeY);
    g.lineStyle(2, 0x8b5a2a, 1);
    const segments = Math.max(20, Math.round((ropeRightX - ropeLeftX) / 22));
    for (let i = 0; i < segments; i++) {
      const x0 = ropeLeftX + ((ropeRightX - ropeLeftX) * i) / segments;
      const x1 = ropeLeftX + ((ropeRightX - ropeLeftX) * (i + 1)) / segments;
      g.lineBetween(x0, ropeY - 3, x1, ropeY + 3);
    }
    g.fillStyle(0x4a2f12, 1);
    g.fillCircle(ropeLeftX, ropeY, 6);
    g.fillCircle(ropeRightX, ropeY, 6);
  }

  private positionLabels(): void {
    const { width } = this.layout;
    const pad = 12;
    this.leftLabelText.setPosition(pad, pad + 4);
    this.rightLabelText.setPosition(width - pad, pad + 4);
    this.leftPowerText.setPosition(pad, pad + 34);
    this.rightPowerText.setPosition(width - pad, pad + 34);
  }

  // ---------- Marker ----------
  private buildMarker(): Phaser.GameObjects.Container {
    const { width, ropeY } = this.layout;
    const c = this.scene.add.container(width / 2, ropeY);
    const pole = this.scene.add.rectangle(0, -28, 4, 60, 0x111111);
    const flag = this.scene.add
      .triangle(0, -46, 0, -16, 0, 16, 28, 0, 0xffd966)
      .setStrokeStyle(2, 0x111111);
    const ribbon = this.scene.add.text(0, -64, 'MID', {
      fontFamily: 'Arial Black',
      fontSize: '13px',
      color: '#111111',
      backgroundColor: '#ffd966',
      padding: { x: 6, y: 2 },
    });
    ribbon.setOrigin(0.5, 1);
    c.add([pole, flag, ribbon]);
    return c;
  }

  private tickMarker(): void {
    const cur = this.marker.x;
    const dx = this.markerTargetX - cur;
    if (Math.abs(dx) < 0.5) return;
    this.marker.x = cur + dx * 0.12;
    // Tiny flag wobble.
    const wobble = Math.sin(this.scene.time.now / 220) * 1.5;
    this.marker.y = this.layout.ropeY + wobble;
  }

  // ---------- Public update ----------
  update(tally: Tally): void {
    const { width, ropeLeftX, ropeRightX } = this.layout;
    const midX = width / 2;
    const halfSpan = (ropeRightX - ropeLeftX) / 2 - 24;
    const clamped = Phaser.Math.Clamp(tally.pull, -1, 1);
    this.markerTargetX = midX + clamped * halfSpan;

    this.leftLabelText.setText(tally.left.label);
    this.rightLabelText.setText(tally.right.label);
    this.leftPowerText.setText(
      `${tally.left.count} on the rope · ${tally.left.power} pull`
    );
    this.rightPowerText.setText(
      `${tally.right.count} on the rope · ${tally.right.power} pull`
    );
  }

  shake(intensity = 0.005, duration = 240): void {
    this.scene.cameras.main.shake(duration, intensity);
  }

  celebrateUpvote(argumentId: string): void {
    const f = this.fightersById.get(argumentId);
    if (!f) return;
    // Brace pose.
    this.scene.tweens.add({
      targets: f,
      scale: 1.3,
      yoyo: true,
      duration: 220,
      ease: 'Quad.easeOut',
    });
    // Sparkle burst at the fighter's position.
    this.spawnSparkles(f.x, f.y - 8);
  }

  private spawnSparkles(x: number, y: number): void {
    const colors = [0xfff2a6, 0xffd966, 0xffffff];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 28 + Math.random() * 18;
      const color = colors[i % colors.length]!;
      const spark = this.scene.add.circle(x, y, 3, color, 1);
      this.effectsLayer.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 4,
        alpha: 0,
        scale: 0.2,
        duration: 600 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    // Big ring.
    const ring = this.scene.add.circle(x, y, 8, 0xffd966, 0.55);
    ring.setStrokeStyle(3, 0xfff2a6, 1);
    this.effectsLayer.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: 3,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // ---------- Fighters ----------
  syncFighters(
    args: ReadonlyArray<Argument>,
    annotations: FighterAnnotations
  ): void {
    this.annotations = annotations;
    this.argLookupCache.clear();
    for (const a of args) this.argLookupCache.set(a.id, a);

    const incomingIds = new Set(args.map((a) => a.id));
    for (const [id, sprite] of this.fightersById) {
      if (!incomingIds.has(id)) {
        sprite.destroy();
        this.fightersById.delete(id);
      }
    }
    // Maintain stable ordering for layout.
    this.orderedIds = this.orderedIds.filter((id) => incomingIds.has(id));
    for (const a of args) {
      if (this.fightersById.has(a.id)) {
        this.applyBadges(a);
        continue;
      }
      const fighter = this.buildFighter(a);
      this.fightersById.set(a.id, fighter);
      this.orderedIds.push(a.id);
      this.fightersLayer.add(fighter);
      this.applyBadges(a);
      fighter.setScale(0);
      this.scene.tweens.add({
        targets: fighter,
        scale: 1,
        duration: 280,
        ease: 'Back.easeOut',
      });
    }
    this.relayoutFighters();
  }

  private applyBadges(a: Argument): void {
    const f = this.fightersById.get(a.id);
    if (!f) return;
    // Remove any prior badge children we added.
    const toRemove = f.list.filter((o: Phaser.GameObjects.GameObject) => {
      const dataObj = o as unknown as { getData?: (k: string) => unknown };
      return typeof dataObj.getData === 'function' &&
        dataObj.getData('badge') === true;
    });
    for (const o of toRemove) {
      f.remove(o, true);
    }
    const badges: Phaser.GameObjects.GameObject[] = [];
    const isYou = a.id === this.annotations.yourArgId;
    const isMvp =
      (a.side === 'left' && a.id === this.annotations.mvpLeftArgId) ||
      (a.side === 'right' && a.id === this.annotations.mvpRightArgId);
    if (isMvp) {
      const crown = this.scene.add
        .text(0, -36, '👑', { fontSize: '20px' })
        .setOrigin(0.5);
      crown.setData('badge', true);
      badges.push(crown);
    }
    if (isYou) {
      const yOff = isMvp ? -54 : -36;
      const star = this.scene.add
        .text(0, yOff, '⭐', { fontSize: '16px' })
        .setOrigin(0.5);
      star.setData('badge', true);
      badges.push(star);
    }
    f.add(badges);
  }

  private buildFighter(a: Argument): Phaser.GameObjects.Container {
    const colors = TEAM_COLORS[a.side];
    const c = this.scene.add.container(0, 0);
    const rng = seededRandom(a.id);

    const skin = pickFrom(rng, SKIN_TONES);
    const hairColor = pickFrom(rng, HAIR_COLORS);
    const accessory: Accessory = pickFrom(rng, [
      'none', 'none', 'beanie', 'cap', 'tophat', 'headband', 'bandana',
    ]);
    const face: FaceMark = pickFrom(rng, [
      'none', 'none', 'none', 'glasses', 'shades', 'mustache', 'beard',
    ]);
    const bodyWidth = 11 + Math.round(rng() * 4);
    const bodyHeight = 20 + Math.round(rng() * 6);

    // Legs (drawn first so body covers their tops).
    const legL = this.scene.add.rectangle(-3, bodyHeight / 2 + 4, 4, 10, 0x222222);
    const legR = this.scene.add.rectangle(3, bodyHeight / 2 + 4, 4, 10, 0x222222);
    // Body
    const body = this.scene.add.rectangle(0, 0, bodyWidth, bodyHeight, colors.primary);
    body.setStrokeStyle(2, 0x111111);
    // Shirt accent stripe across body.
    const stripe = this.scene.add.rectangle(0, 2, bodyWidth, 3, colors.accent);
    // Head
    const headY = -bodyHeight / 2 - 4;
    const head = this.scene.add.circle(0, headY, 7, skin);
    head.setStrokeStyle(2, 0x111111);
    // Arms reaching toward rope.
    const reachDir = a.side === 'left' ? 1 : -1;
    const armNear = this.scene.add.rectangle(
      reachDir * 9,
      -2,
      14,
      4,
      colors.primary
    );
    armNear.setStrokeStyle(2, 0x111111);
    const armFar = this.scene.add.rectangle(
      -reachDir * 7,
      -4,
      9,
      4,
      colors.primary
    );
    armFar.setStrokeStyle(2, 0x111111);

    const layers: Phaser.GameObjects.GameObject[] = [
      legL,
      legR,
      body,
      stripe,
      armFar,
      armNear,
      head,
    ];

    // Hair tuft (drawn behind hat).
    if (accessory !== 'beanie' && accessory !== 'tophat') {
      const hair = this.scene.add.rectangle(0, headY - 7, 12, 4, hairColor);
      layers.push(hair);
    }

    // Face marks.
    if (face === 'glasses') {
      const gl = this.scene.add.graphics();
      gl.lineStyle(1.5, 0x111111, 1);
      gl.strokeCircle(-3, headY, 2.5);
      gl.strokeCircle(3, headY, 2.5);
      gl.lineBetween(-0.5, headY, 0.5, headY);
      layers.push(gl);
    } else if (face === 'shades') {
      const sh = this.scene.add.graphics();
      sh.fillStyle(0x111111, 1);
      sh.fillRect(-6, headY - 1.5, 5, 3);
      sh.fillRect(1, headY - 1.5, 5, 3);
      sh.lineStyle(1, 0x111111);
      sh.lineBetween(-1, headY, 1, headY);
      layers.push(sh);
    } else if (face === 'mustache') {
      const m = this.scene.add.rectangle(0, headY + 2, 6, 1.5, 0x111111);
      layers.push(m);
    } else if (face === 'beard') {
      const beard = this.scene.add.rectangle(0, headY + 4, 10, 5, hairColor);
      layers.push(beard);
    }

    // Accessories on head.
    if (accessory === 'beanie') {
      const beanie = this.scene.add.rectangle(
        0,
        headY - 6,
        14,
        6,
        Phaser.Display.Color.GetColor(80, 80, 200)
      );
      beanie.setStrokeStyle(1, 0x111111);
      const cuff = this.scene.add.rectangle(0, headY - 3, 14, 2, 0xffffff);
      layers.push(beanie, cuff);
    } else if (accessory === 'cap') {
      const cap = this.scene.add.rectangle(0, headY - 6, 12, 5, hairColor);
      cap.setStrokeStyle(1, 0x111111);
      const brim = this.scene.add.rectangle(reachDir * 5, headY - 4, 8, 2, hairColor);
      brim.setStrokeStyle(1, 0x111111);
      layers.push(cap, brim);
    } else if (accessory === 'tophat') {
      const brim = this.scene.add.rectangle(0, headY - 6, 16, 2, 0x111111);
      const crown = this.scene.add.rectangle(0, headY - 11, 9, 8, 0x111111);
      layers.push(brim, crown);
    } else if (accessory === 'headband') {
      const band = this.scene.add.rectangle(0, headY - 3, 16, 2, 0xd11b1b);
      layers.push(band);
    } else if (accessory === 'bandana') {
      const ban = this.scene.add.rectangle(0, headY - 4, 14, 5, 0x2a8a4a);
      ban.setStrokeStyle(1, 0x111111);
      layers.push(ban);
    }

    c.add(layers);

    // Slight bobbing.
    this.scene.tweens.add({
      targets: c,
      y: '+=2',
      duration: 600 + rng() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return c;
  }

  private relayoutFighters(): void {
    const { ropeLeftX, ropeRightX, ropeY } = this.layout;
    const midX = (ropeLeftX + ropeRightX) / 2;

    const leftIds: string[] = [];
    const rightIds: string[] = [];
    for (const id of this.orderedIds) {
      const arg = this.argLookupCache.get(id);
      if (!arg) continue;
      (arg.side === 'left' ? leftIds : rightIds).push(id);
    }

    const place = (list: string[], side: Side) => {
      const sign = side === 'left' ? -1 : 1;
      const startX = midX + sign * 56;
      const stepX = 22;
      list.forEach((id, i) => {
        const f = this.fightersById.get(id);
        if (!f) return;
        const row = Math.floor(i / 14);
        const col = i % 14;
        f.setPosition(startX + sign * col * stepX, ropeY + 10 + row * 28);
      });
    };
    place(leftIds, 'left');
    place(rightIds, 'right');
  }
}

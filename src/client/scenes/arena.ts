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

export class Arena {
  private scene: Phaser.Scene;
  private layout: ArenaLayout;
  private bgGraphics: Phaser.GameObjects.Graphics;
  private groundGraphics: Phaser.GameObjects.Graphics;
  private ropeGraphics: Phaser.GameObjects.Graphics;
  private fightersLayer: Phaser.GameObjects.Container;
  private marker: Phaser.GameObjects.Container;
  private markerTargetX = 0;
  private leftLabelText: Phaser.GameObjects.Text;
  private rightLabelText: Phaser.GameObjects.Text;
  private leftPowerText: Phaser.GameObjects.Text;
  private rightPowerText: Phaser.GameObjects.Text;
  private fightersById = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;
    this.layout = computeArenaLayout(width, height);
    this.bgGraphics = scene.add.graphics();
    this.groundGraphics = scene.add.graphics();
    this.ropeGraphics = scene.add.graphics();
    this.fightersLayer = scene.add.container(0, 0);

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
    // Sky gradient — three stacked bands fake a vertical gradient.
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
    // Sun.
    g.fillStyle(0xffeeb0, 0.9);
    g.fillCircle(width * 0.78, height * 0.18, Math.min(46, width * 0.08));
    g.fillStyle(0xffeeb0, 0.3);
    g.fillCircle(width * 0.78, height * 0.18, Math.min(72, width * 0.13));
    // A few clouds.
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
  }

  private drawGround(): void {
    const g = this.groundGraphics;
    g.clear();
    const { width, height, groundY } = this.layout;
    g.fillStyle(0x5a3a1f, 1);
    g.fillRect(0, groundY, width, height - groundY);
    g.fillStyle(0x6b4422, 1);
    g.fillRect(0, groundY, width, 10);
    // Center pit (where the marker hovers above).
    g.fillStyle(0x3d2412, 1);
    g.fillRect(width / 2 - 28, groundY, 56, 8);
  }

  private drawRope(): void {
    const g = this.ropeGraphics;
    g.clear();
    const { ropeY, ropeLeftX, ropeRightX } = this.layout;
    // Outline.
    g.lineStyle(8, 0x4a2f12, 1);
    g.lineBetween(ropeLeftX, ropeY, ropeRightX, ropeY);
    // Twist effect — diagonal segments along the rope.
    g.lineStyle(2, 0x8b5a2a, 1);
    const segments = Math.max(20, Math.round((ropeRightX - ropeLeftX) / 22));
    for (let i = 0; i < segments; i++) {
      const x0 = ropeLeftX + ((ropeRightX - ropeLeftX) * i) / segments;
      const x1 = ropeLeftX + ((ropeRightX - ropeLeftX) * (i + 1)) / segments;
      g.lineBetween(x0, ropeY - 3, x1, ropeY + 3);
    }
    // Tip flares.
    g.fillStyle(0x4a2f12, 1);
    g.fillCircle(ropeLeftX, ropeY, 6);
    g.fillCircle(ropeRightX, ropeY, 6);
  }

  private positionLabels(): void {
    const { width, height } = this.layout;
    const pad = 12;
    this.leftLabelText.setPosition(pad, pad + 4);
    this.rightLabelText.setPosition(width - pad, pad + 4);
    this.leftPowerText.setPosition(pad, pad + 34);
    this.rightPowerText.setPosition(width - pad, pad + 34);
    void height;
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
  }

  // ---------- Public update ----------
  update(tally: Tally): void {
    const { width, ropeLeftX, ropeRightX } = this.layout;
    const midX = width / 2;
    const halfSpan = (ropeRightX - ropeLeftX) / 2 - 24;
    // pull in [-1, 1]; clamp to avoid overshoot at edges.
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

  // ---------- Fighters ----------
  syncFighters(args: ReadonlyArray<Argument>): void {
    const incomingIds = new Set(args.map((a) => a.id));
    // Remove fighters whose arguments are gone.
    for (const [id, sprite] of this.fightersById) {
      if (!incomingIds.has(id)) {
        sprite.destroy();
        this.fightersById.delete(id);
      }
    }
    // Add new ones.
    for (const a of args) {
      if (this.fightersById.has(a.id)) continue;
      const fighter = this.buildFighter(a);
      this.fightersById.set(a.id, fighter);
      this.fightersLayer.add(fighter);
      // Entrance pop.
      fighter.setScale(0);
      this.scene.tweens.add({
        targets: fighter,
        scale: 1,
        duration: 280,
        ease: 'Back.easeOut',
      });
    }
    this.relayoutFighters(args);
  }

  highlightFighter(argumentId: string): void {
    const f = this.fightersById.get(argumentId);
    if (!f) return;
    this.scene.tweens.add({
      targets: f,
      scale: 1.3,
      yoyo: true,
      duration: 220,
      ease: 'Quad.easeOut',
    });
  }

  private buildFighter(a: Argument): Phaser.GameObjects.Container {
    const colors = TEAM_COLORS[a.side];
    const c = this.scene.add.container(0, 0);
    const rand = seededRandom(a.id);

    const skin = 0xf2c79a;
    // Body
    const body = this.scene.add.rectangle(0, 0, 12, 22, colors.primary);
    body.setStrokeStyle(2, 0x111111);
    // Head
    const head = this.scene.add.circle(0, -16, 7, skin);
    head.setStrokeStyle(2, 0x111111);
    // Hair tuft (color varies a bit)
    const hairColors = [0x2b1a0a, 0x6b3f1a, 0xc7a25a, 0x222222];
    const hairColor = hairColors[Math.floor(rand() * hairColors.length)]!;
    const hair = this.scene.add.rectangle(0, -22, 12, 4, hairColor);
    // Legs
    const legL = this.scene.add.rectangle(-3, 14, 4, 10, 0x222222);
    const legR = this.scene.add.rectangle(3, 14, 4, 10, 0x222222);
    // Arms reaching toward the rope center.
    const reachDir = a.side === 'left' ? 1 : -1;
    const armNear = this.scene.add.rectangle(
      reachDir * 9,
      -2,
      12,
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

    c.add([legL, legR, body, armFar, armNear, head, hair]);

    // Slight bobbing.
    this.scene.tweens.add({
      targets: c,
      y: '+=2',
      duration: 600 + rand() * 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return c;
  }

  private relayoutFighters(currentArgs?: ReadonlyArray<Argument>): void {
    const { ropeLeftX, ropeRightX, ropeY } = this.layout;
    const midX = (ropeLeftX + ropeRightX) / 2;

    // We need an ordered list. If the caller didn't pass one, infer from the
    // map insertion order so we don't reshuffle on every resize.
    const ids = Array.from(this.fightersById.keys());
    const argLookup = new Map<string, Argument>();
    if (currentArgs) for (const a of currentArgs) argLookup.set(a.id, a);

    // Position each side independently, packing outward from the center.
    const leftIds: string[] = [];
    const rightIds: string[] = [];
    for (const id of ids) {
      const arg = argLookup.get(id);
      if (arg) {
        (arg.side === 'left' ? leftIds : rightIds).push(id);
      }
    }
    const placeSide = (
      list: string[],
      side: Side
    ) => {
      const sign = side === 'left' ? -1 : 1;
      const startX = midX + sign * 56;
      const stepX = 22;
      list.forEach((id, i) => {
        const f = this.fightersById.get(id);
        if (!f) return;
        const row = Math.floor(i / 14);
        const col = i % 14;
        f.setPosition(
          startX + sign * col * stepX,
          ropeY + 10 + row * 28
        );
      });
    };
    placeSide(leftIds, 'left');
    placeSide(rightIds, 'right');
  }
}

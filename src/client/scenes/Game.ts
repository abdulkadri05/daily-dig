import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import type {
  DigResponse,
  FoundTreasure,
  InitGameResponse,
  LeaderboardEntry,
  PlayerDayState,
} from '../../shared/api';
import {
  computeIslandLayout,
  drawIsland,
  isInsideIsland,
  screenToUnit,
  unitToScreen,
  type IslandLayout,
} from './island';

type Hud = {
  tapsText: Phaser.GameObjects.Text;
  foundText: Phaser.GameObjects.Text;
  dateText: Phaser.GameObjects.Text;
  burialBtn: Phaser.GameObjects.Text;
  leaderboardTitle: Phaser.GameObjects.Text;
  leaderboardRows: Phaser.GameObjects.Text[];
};

export class Game extends Scene {
  private layout!: IslandLayout;
  private islandG!: Phaser.GameObjects.Graphics;
  private markerLayer!: Phaser.GameObjects.Container;
  private effectsLayer!: Phaser.GameObjects.Container;
  private hud!: Hud;
  private revealGroup: Phaser.GameObjects.GameObject[] = [];

  private date = '';
  private username = 'anonymous';
  private player: PlayerDayState = {
    tapsUsed: 0,
    tapsLimit: 20,
    found: [],
    hasBuried: false,
  };
  private treasureCount = 0;
  private leaderboard: LeaderboardEntry[] = [];
  private busy = false;

  constructor() {
    super('Game');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a2030);
    this.layout = computeIslandLayout(this.scale.width, this.scale.height);
    this.islandG = this.add.graphics();
    this.markerLayer = this.add.container(0, 0);
    this.effectsLayer = this.add.container(0, 0);
    this.buildHud();
    drawIsland(this.islandG, this.layout);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      void this.onPointerDown(p);
    });

    this.scale.on('resize', () => this.refreshLayout());

    void this.loadInit();
  }

  // ---------- Layout ----------
  private refreshLayout(): void {
    const { width, height } = this.scale;
    this.cameras.resize(width, height);
    this.layout = computeIslandLayout(width, height);
    drawIsland(this.islandG, this.layout);
    this.redrawMarkers();
    this.positionHud();
  }

  private buildHud(): void {
    const baseStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Arial Black',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    };
    const small: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    };
    this.hud = {
      dateText: this.add.text(0, 0, '', small).setOrigin(0, 0),
      tapsText: this.add.text(0, 0, '', baseStyle).setOrigin(0, 0),
      foundText: this.add.text(0, 0, '', baseStyle).setOrigin(1, 0),
      burialBtn: this.add
        .text(0, 0, '🪙 Bury for tomorrow', {
          ...baseStyle,
          fontSize: '18px',
          backgroundColor: '#d93900',
          padding: { x: 14, y: 8 },
        })
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', (p: Phaser.Input.Pointer) => {
          p.event?.stopPropagation?.();
          this.scene.start('Bury');
        }),
      leaderboardTitle: this.add
        .text(0, 0, '🏴‍☠️ Top hunters', small)
        .setOrigin(1, 0),
      leaderboardRows: [],
    };
    for (let i = 0; i < 5; i++) {
      this.hud.leaderboardRows.push(
        this.add.text(0, 0, '', small).setOrigin(1, 0)
      );
    }
    this.positionHud();
  }

  private positionHud(): void {
    const { width, height } = this.scale;
    const pad = 12;
    this.hud.dateText.setPosition(pad, pad);
    this.hud.tapsText.setPosition(pad, pad + 18);
    this.hud.foundText.setPosition(width - pad, pad);

    this.hud.leaderboardTitle.setPosition(width - pad, pad + 28);
    this.hud.leaderboardRows.forEach((row, i) => {
      row.setPosition(width - pad, pad + 48 + i * 18);
    });

    // Bury button anchored in the reserved bottom strip.
    this.hud.burialBtn.setPosition(width / 2, height - 30);
  }

  // ---------- Network ----------
  private async loadInit(): Promise<void> {
    try {
      const res = await fetch('/api/init');
      if (!res.ok) throw new Error(`init ${res.status}`);
      const data = (await res.json()) as InitGameResponse;
      this.date = data.date;
      this.username = data.username;
      this.player = data.player;
      this.treasureCount = data.treasureCount;
      this.leaderboard = data.leaderboard;
      this.refreshHudText();
      this.redrawMarkers();
    } catch (err) {
      console.error('init failed', err);
      this.hud.dateText.setText('Couldn\'t reach the server. Try refreshing.');
    }
  }

  private async postDig(ux: number, uy: number): Promise<DigResponse | null> {
    try {
      const res = await fetch('/api/dig', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pos: { x: ux, y: uy } }),
      });
      if (!res.ok) throw new Error(`dig ${res.status}`);
      return (await res.json()) as DigResponse;
    } catch (err) {
      console.error('dig failed', err);
      return null;
    }
  }

  // ---------- Input ----------
  private async onPointerDown(p: Phaser.Input.Pointer): Promise<void> {
    if (this.busy) return;
    if (!isInsideIsland(this.layout, p.x, p.y)) return;
    if (this.player.tapsUsed >= this.player.tapsLimit) {
      this.flashOutOfTaps();
      return;
    }
    this.busy = true;
    const unit = screenToUnit(this.layout, p.x, p.y);
    const result = await this.postDig(unit.x, unit.y);
    if (!result) {
      this.busy = false;
      return;
    }
    this.player = result.player;

    if (result.outcome === 'found') {
      this.spawnFindBurst(unit.x, unit.y);
      this.showReveal(result.treasure);
    } else if (result.outcome === 'miss') {
      this.spawnMissRipple(unit.x, unit.y, result.nearest);
    } else {
      this.flashOutOfTaps();
    }

    this.refreshHudText();
    this.redrawMarkers();
    this.busy = false;
  }

  // ---------- HUD content ----------
  private refreshHudText(): void {
    const tapsLeft = Math.max(
      0,
      this.player.tapsLimit - this.player.tapsUsed
    );
    this.hud.tapsText.setText(`Taps left: ${tapsLeft} / ${this.player.tapsLimit}`);
    this.hud.foundText.setText(
      `Found: ${this.player.found.length} / ${this.treasureCount}`
    );
    this.hud.dateText.setText(
      `Daily Dig · ${this.date} · u/${this.username}`
    );

    this.hud.leaderboardRows.forEach((row, i) => {
      const entry = this.leaderboard[i];
      if (!entry) {
        row.setText('');
        return;
      }
      row.setText(
        `${i + 1}. ${entry.username} — ${entry.foundCount}🪙 ${entry.tapsUsed}🩸`
      );
    });

    if (this.player.hasBuried) {
      this.hud.burialBtn.setText('✅ Buried for tomorrow');
      this.hud.burialBtn.disableInteractive();
      this.hud.burialBtn.setStyle({ backgroundColor: '#555555' });
    }
  }

  // ---------- Markers (previously found chests) ----------
  private redrawMarkers(): void {
    this.markerLayer.removeAll(true);
    for (const f of this.player.found) {
      const p = unitToScreen(this.layout, f.pos.x, f.pos.y);
      const chest = this.add.container(p.x, p.y);
      const body = this.add.rectangle(0, 4, 18, 12, 0xb8862a).setStrokeStyle(
        2,
        0x4d2e0f
      );
      const lid = this.add.rectangle(0, -3, 18, 8, 0xd9a44a).setStrokeStyle(
        2,
        0x4d2e0f
      );
      const lock = this.add.rectangle(0, 2, 4, 4, 0xfff1a8);
      chest.add([body, lid, lock]);
      this.markerLayer.add(chest);
    }
  }

  // ---------- Effects ----------
  private spawnMissRipple(ux: number, uy: number, nearest: number): void {
    const p = unitToScreen(this.layout, ux, uy);
    // Map distance to color + max radius. Nearest ~0.04 (find radius) → hot;
    // ~0.5 → cold. We clamp so the visuals stay readable.
    const heat = Phaser.Math.Clamp(1 - nearest / 0.5, 0, 1);
    const color = Phaser.Display.Color.GetColor(
      Math.round(40 + heat * 215),
      Math.round(160 - heat * 110),
      Math.round(255 - heat * 220)
    );
    const maxRadius = 24 + heat * 56;

    const ring = this.add.circle(p.x, p.y, 6, color, 0.55);
    ring.setStrokeStyle(2, color, 1);
    const dot = this.add.circle(p.x, p.y, 3, 0xffffff, 0.9);
    const label = this.add
      .text(p.x, p.y - maxRadius - 6, `${Math.round(nearest * 1000)} m`, {
        fontFamily: 'Arial Black',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);

    this.effectsLayer.add([ring, dot, label]);

    this.tweens.add({
      targets: ring,
      radius: maxRadius,
      alpha: 0,
      duration: 700,
      ease: 'Quad.easeOut',
      onUpdate: () => ring.setRadius(ring.radius),
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: dot,
      alpha: 0,
      duration: 700,
      onComplete: () => dot.destroy(),
    });
    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 14,
      duration: 900,
      ease: 'Quad.easeOut',
      delay: 250,
      onComplete: () => label.destroy(),
    });
  }

  private spawnFindBurst(ux: number, uy: number): void {
    const p = unitToScreen(this.layout, ux, uy);
    const burst = this.add.circle(p.x, p.y, 10, 0xffd966, 0.85);
    burst.setStrokeStyle(3, 0xffe97a, 1);
    this.effectsLayer.add(burst);
    this.tweens.add({
      targets: burst,
      scale: 6,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
    // A few sparkle dots.
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spark = this.add.circle(p.x, p.y, 3, 0xfff2a6, 1);
      this.effectsLayer.add(spark);
      this.tweens.add({
        targets: spark,
        x: p.x + Math.cos(angle) * 50,
        y: p.y + Math.sin(angle) * 50,
        alpha: 0,
        duration: 700,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private clearReveal(): void {
    for (const o of this.revealGroup) o.destroy();
    this.revealGroup = [];
  }

  private showReveal(t: FoundTreasure): void {
    this.clearReveal();
    const { width, height } = this.scale;
    const cardW = Math.min(width - 32, 460);
    const cardH = 150;
    const cx = width / 2;
    const cy = height / 2;

    const dim = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.45
    );
    dim.setInteractive();

    const card = this.add
      .rectangle(cx, cy, cardW, cardH, 0xfff7e0, 1)
      .setStrokeStyle(4, 0x4d2e0f);
    const title = this.add
      .text(cx, cy - cardH / 2 + 18, '🎉 You found a chest!', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#4d2e0f',
      })
      .setOrigin(0.5, 0);
    const hider = this.add
      .text(cx, cy - 10, `Buried by u/${t.hider}`, {
        fontFamily: 'Arial',
        fontSize: '16px',
        color: '#4d2e0f',
      })
      .setOrigin(0.5, 0);
    const clue = this.add
      .text(cx, cy + 12, `"${t.clue}"`, {
        fontFamily: 'Arial',
        fontSize: '15px',
        fontStyle: 'italic',
        color: '#3a2308',
        wordWrap: { width: cardW - 40 },
        align: 'center',
      })
      .setOrigin(0.5, 0);
    const dismiss = this.add
      .text(cx, cy + cardH / 2 - 22, 'Keep digging', {
        fontFamily: 'Arial Black',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#4d2e0f',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation?.();
        this.clearReveal();
      });

    this.revealGroup = [dim, card, title, hider, clue, dismiss];

    // Slide the card up from below for a little juice.
    card.y += 40;
    title.y += 40;
    hider.y += 40;
    clue.y += 40;
    dismiss.y += 40;
    this.tweens.add({
      targets: [card, title, hider, clue, dismiss],
      y: '-=40',
      duration: 240,
      ease: 'Back.easeOut',
    });
  }

  private flashOutOfTaps(): void {
    const { width, height } = this.scale;
    const txt = this.add
      .text(width / 2, height * 0.4, 'Out of taps — come back tomorrow!', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: txt,
      alpha: 0,
      duration: 1600,
      delay: 600,
      onComplete: () => txt.destroy(),
    });
  }
}

import * as Phaser from 'phaser';
import { Scene } from 'phaser';

export class MainMenu extends Scene {
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private cta?: Phaser.GameObjects.Text;
  private bg?: Phaser.GameObjects.Graphics;
  private rope?: Phaser.GameObjects.Graphics;

  constructor() {
    super('MainMenu');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x9b4a7a);
    this.bg = this.add.graphics();
    this.rope = this.add.graphics();
    this.title = this.add
      .text(0, 0, 'TAKE SIDES', {
        fontFamily: 'Arial Black',
        fontSize: '48px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 7,
      })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(
        0,
        0,
        'Pick a side. Write one line. Watch upvotes pull the rope.',
        {
          fontFamily: 'Arial',
          fontSize: '15px',
          color: '#fff',
          stroke: '#000',
          strokeThickness: 3,
          align: 'center',
          wordWrap: { width: 340 },
        }
      )
      .setOrigin(0.5);
    this.cta = this.add
      .text(0, 0, '🪢  Start', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#fff',
        backgroundColor: '#d93900',
        padding: { x: 22, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('Game'));

    this.refresh();
    this.scale.on('resize', () => this.refresh());
  }

  private refresh(): void {
    const { width, height } = this.scale;
    this.cameras.resize(width, height);
    if (this.bg) {
      this.bg.clear();
      const bands = [
        { color: 0xf6c878, ratio: 0.4 },
        { color: 0xea8a52, ratio: 0.7 },
        { color: 0x9b4a7a, ratio: 1.0 },
      ];
      let y = 0;
      let prev = 0;
      for (const b of bands) {
        const next = Math.round(height * b.ratio);
        this.bg.fillStyle(b.color, 1);
        this.bg.fillRect(0, y, width, next - prev);
        y = next;
        prev = next;
      }
      this.bg.fillStyle(0xffeeb0, 0.85);
      this.bg.fillCircle(width * 0.8, height * 0.18, 40);
    }
    if (this.rope) {
      this.rope.clear();
      this.rope.lineStyle(8, 0x4a2f12);
      const y = height * 0.55;
      this.rope.lineBetween(width * 0.05, y, width * 0.95, y);
      this.rope.fillStyle(0xffd966);
      this.rope.fillTriangle(
        width / 2,
        y - 24,
        width / 2 - 12,
        y - 4,
        width / 2 + 12,
        y - 4
      );
    }
    if (this.title) this.title.setPosition(width / 2, height * 0.25);
    if (this.subtitle) this.subtitle.setPosition(width / 2, height * 0.36);
    if (this.cta) this.cta.setPosition(width / 2, height * 0.74);
  }
}

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import {
  computeIslandLayout,
  drawIsland,
  type IslandLayout,
} from './island';

export class MainMenu extends Scene {
  private layout!: IslandLayout;
  private islandG!: Phaser.GameObjects.Graphics;
  private title?: Phaser.GameObjects.Text;
  private subtitle?: Phaser.GameObjects.Text;
  private cta?: Phaser.GameObjects.Text;
  private credit?: Phaser.GameObjects.Text;

  constructor() {
    super('MainMenu');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a2030);
    this.layout = computeIslandLayout(this.scale.width, this.scale.height);
    this.islandG = this.add.graphics();
    drawIsland(this.islandG, this.layout);

    this.title = this.add
      .text(0, 0, 'The Daily Dig', {
        fontFamily: 'Arial Black',
        fontSize: '42px',
        color: '#fff7e0',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(
        0,
        0,
        'Hunt for chests other Redditors buried.\nLeave one behind for tomorrow.',
        {
          fontFamily: 'Arial',
          fontSize: '16px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
          wordWrap: { width: 320 },
        }
      )
      .setOrigin(0.5);
    this.cta = this.add
      .text(0, 0, '⛏️  Start digging', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#d93900',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.start('Game'));
    this.credit = this.add
      .text(0, 0, 'A daily game for r/__', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#cccccc',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    this.positionUi();
    this.scale.on('resize', () => this.refreshLayout());
  }

  private refreshLayout(): void {
    const { width, height } = this.scale;
    this.cameras.resize(width, height);
    this.layout = computeIslandLayout(width, height);
    drawIsland(this.islandG, this.layout);
    this.positionUi();
  }

  private positionUi(): void {
    const { width, height } = this.scale;
    if (this.title) this.title.setPosition(width / 2, height * 0.22);
    if (this.subtitle) this.subtitle.setPosition(width / 2, height * 0.32);
    if (this.cta) this.cta.setPosition(width / 2, height * 0.62);
    if (this.credit) this.credit.setPosition(width / 2, height - 18);
  }
}

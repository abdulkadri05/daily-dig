import { Scene } from 'phaser';

// Currently unused — kept for future "end of day" summary screen.
export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a2030);
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'See you tomorrow', {
        fontFamily: 'Arial Black',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5);
    this.input.once('pointerdown', () => this.scene.start('MainMenu'));
  }
}

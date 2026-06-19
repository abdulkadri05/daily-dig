import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import type { BuryResponse } from '../../shared/api';
import { MAX_CLUE_LENGTH } from '../../shared/api';
import {
  computeIslandLayout,
  drawIsland,
  isInsideIsland,
  screenToUnit,
  unitToScreen,
  type IslandLayout,
} from './island';

export class Bury extends Scene {
  private layout!: IslandLayout;
  private islandG!: Phaser.GameObjects.Graphics;
  private xMarker?: Phaser.GameObjects.Container;
  private pickedUnit: { x: number; y: number } | null = null;
  private headerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Text;
  private clueOverlay?: HTMLDivElement;

  constructor() {
    super('Bury');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a2030);
    this.layout = computeIslandLayout(this.scale.width, this.scale.height);
    this.islandG = this.add.graphics();
    drawIsland(this.islandG, this.layout);

    this.headerText = this.add
      .text(0, 0, '🪙 Pick a spot to bury your treasure', {
        fontFamily: 'Arial Black',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);
    this.hintText = this.add
      .text(
        0,
        0,
        'Tap the island. Then write a one-line clue for tomorrow’s hunters.',
        {
          fontFamily: 'Arial',
          fontSize: '14px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
          wordWrap: { width: 320 },
        }
      )
      .setOrigin(0.5, 0);
    this.backBtn = this.add
      .text(0, 0, '← Back to hunt', {
        fontFamily: 'Arial Black',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation?.();
        this.returnToHunt();
      });

    this.positionUi();
    this.scale.on('resize', () => this.refreshLayout());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!isInsideIsland(this.layout, p.x, p.y)) return;
      const unit = screenToUnit(this.layout, p.x, p.y);
      this.placeX(unit.x, unit.y);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeOverlay());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.removeOverlay());
  }

  private refreshLayout(): void {
    const { width, height } = this.scale;
    this.cameras.resize(width, height);
    this.layout = computeIslandLayout(width, height);
    drawIsland(this.islandG, this.layout);
    this.positionUi();
    if (this.pickedUnit && this.xMarker) {
      const p = unitToScreen(
        this.layout,
        this.pickedUnit.x,
        this.pickedUnit.y
      );
      this.xMarker.setPosition(p.x, p.y);
    }
    this.positionOverlay();
  }

  private positionUi(): void {
    const { width, height } = this.scale;
    this.headerText.setPosition(width / 2, 12);
    this.hintText.setPosition(width / 2, 40);
    this.backBtn.setPosition(12, 12);
    void height;
  }

  private placeX(ux: number, uy: number): void {
    this.pickedUnit = { x: ux, y: uy };
    const p = unitToScreen(this.layout, ux, uy);

    if (this.xMarker) this.xMarker.destroy();
    const container = this.add.container(p.x, p.y);
    const g = this.add.graphics();
    g.lineStyle(4, 0xd11b1b, 1);
    g.lineBetween(-12, -12, 12, 12);
    g.lineBetween(12, -12, -12, 12);
    const halo = this.add.circle(0, 0, 22, 0xffffff, 0.18);
    container.add([halo, g]);
    this.xMarker = container;
    this.tweens.add({
      targets: halo,
      scale: 1.4,
      alpha: 0,
      duration: 700,
      repeat: -1,
      ease: 'Quad.easeOut',
    });

    this.showOverlay();
  }

  // ---------- DOM clue overlay ----------
  private showOverlay(): void {
    if (this.clueOverlay) {
      this.clueOverlay.querySelector('input')?.focus();
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '50%';
    wrapper.style.transform = 'translateX(-50%)';
    wrapper.style.bottom = '14px';
    wrapper.style.zIndex = '10';
    wrapper.style.display = 'flex';
    wrapper.style.gap = '8px';
    wrapper.style.padding = '10px 12px';
    wrapper.style.background = 'rgba(20, 20, 20, 0.85)';
    wrapper.style.border = '2px solid #d93900';
    wrapper.style.borderRadius = '10px';
    wrapper.style.fontFamily =
      '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = MAX_CLUE_LENGTH;
    input.placeholder = 'Your one-line clue...';
    input.style.flex = '1 1 auto';
    input.style.minWidth = '180px';
    input.style.padding = '8px 10px';
    input.style.border = 'none';
    input.style.borderRadius = '6px';
    input.style.fontSize = '14px';
    input.style.background = '#fff7e0';
    input.style.color = '#3a2308';

    const submit = document.createElement('button');
    submit.textContent = 'Bury';
    submit.style.background = '#d93900';
    submit.style.color = '#fff';
    submit.style.border = 'none';
    submit.style.borderRadius = '6px';
    submit.style.padding = '8px 14px';
    submit.style.fontWeight = '700';
    submit.style.cursor = 'pointer';
    submit.style.fontSize = '14px';

    const status = document.createElement('div');
    status.style.color = '#ffd699';
    status.style.fontSize = '12px';
    status.style.alignSelf = 'center';
    status.style.minWidth = '0';
    status.style.maxWidth = '160px';

    const trySubmit = () => {
      const clue = input.value.trim();
      if (!clue || !this.pickedUnit) {
        status.textContent = 'Write a clue first.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Burying...';
      void this.submitBury(this.pickedUnit, clue, status, submit);
    };

    submit.addEventListener('click', trySubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trySubmit();
    });

    wrapper.appendChild(input);
    wrapper.appendChild(submit);
    wrapper.appendChild(status);
    document.body.appendChild(wrapper);
    this.clueOverlay = wrapper;
    setTimeout(() => input.focus(), 50);
  }

  private positionOverlay(): void {
    // Stays bottom-centered via CSS; nothing to do unless we want to anchor to
    // canvas instead. Keeping fixed-bottom is simpler and consistent on mobile.
  }

  private removeOverlay(): void {
    if (this.clueOverlay) {
      this.clueOverlay.remove();
      delete this.clueOverlay;
    }
  }

  private async submitBury(
    pos: { x: number; y: number },
    clue: string,
    status: HTMLDivElement,
    submit: HTMLButtonElement
  ): Promise<void> {
    try {
      const res = await fetch('/api/bury', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pos, clue }),
      });
      if (!res.ok) throw new Error(`bury ${res.status}`);
      const data = (await res.json()) as BuryResponse;
      if (!data.ok) {
        status.textContent = data.message;
        submit.disabled = false;
        submit.textContent = 'Bury';
        return;
      }
      this.removeOverlay();
      this.showSuccess(data.message);
    } catch (err) {
      console.error('bury failed', err);
      status.textContent = 'Network error. Try again.';
      submit.disabled = false;
      submit.textContent = 'Bury';
    }
  }

  private showSuccess(message: string): void {
    const { width, height } = this.scale;
    const dim = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      0x000000,
      0.45
    );
    const card = this.add
      .rectangle(width / 2, height / 2, Math.min(width - 32, 380), 140, 0xfff7e0)
      .setStrokeStyle(4, 0x4d2e0f);
    const title = this.add
      .text(width / 2, height / 2 - 30, '🪙 Buried!', {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color: '#4d2e0f',
      })
      .setOrigin(0.5);
    const body = this.add
      .text(width / 2, height / 2, message, {
        fontFamily: 'Arial',
        fontSize: '15px',
        color: '#3a2308',
        wordWrap: { width: 320 },
        align: 'center',
      })
      .setOrigin(0.5);
    const btn = this.add
      .text(width / 2, height / 2 + 40, 'Back to hunt', {
        fontFamily: 'Arial Black',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#4d2e0f',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', (p: Phaser.Input.Pointer) => {
        p.event?.stopPropagation?.();
        dim.destroy();
        card.destroy();
        title.destroy();
        body.destroy();
        btn.destroy();
        this.returnToHunt();
      });
  }

  private returnToHunt(): void {
    this.removeOverlay();
    this.scene.start('Game');
  }
}

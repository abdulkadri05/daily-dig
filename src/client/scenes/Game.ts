import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import {
  MAX_ARG_LENGTH,
  type Argument,
  type InitResponse,
  type PlayerState,
  type Side,
  type SubmitResponse,
  type Tally,
  type UpvoteResponse,
} from '../../shared/api';
import { Arena } from './arena';

const REFRESH_MS = 8000;

export class Game extends Scene {
  private arena!: Arena;
  private promptText!: Phaser.GameObjects.Text;
  private dateText!: Phaser.GameObjects.Text;

  private state: {
    username: string;
    date: string;
    question: string;
    leftLabel: string;
    rightLabel: string;
    tally: Tally;
    args: Argument[];
    player: PlayerState;
  } | null = null;

  private panel?: HTMLDivElement;
  private modal?: HTMLDivElement;
  private refreshHandle?: number;

  constructor() {
    super('Game');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x9b4a7a);

    this.arena = new Arena(this, this.scale.width, this.scale.height);

    this.promptText = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial Black',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
        wordWrap: { width: this.scale.width - 32 },
      })
      .setOrigin(0.5, 0);
    this.dateText = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    this.positionHud();
    this.scale.on('resize', () => this.onResize());

    this.buildPanel();
    void this.loadInit();

    this.refreshHandle = window.setInterval(() => {
      void this.refresh();
    }, REFRESH_MS);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.teardown());
  }

  private teardown(): void {
    if (this.refreshHandle) {
      clearInterval(this.refreshHandle);
      delete this.refreshHandle;
    }
    if (this.panel) {
      this.panel.remove();
      delete this.panel;
    }
    if (this.modal) {
      this.modal.remove();
      delete this.modal;
    }
    document.documentElement.style.removeProperty('--ts-panel-height');
  }

  // ---------- Layout ----------
  private onResize(): void {
    const { width, height } = this.scale;
    this.cameras.resize(width, height);
    this.arena.resize(width, height);
    this.promptText.setStyle({ wordWrap: { width: width - 32 } });
    this.positionHud();
  }

  private positionHud(): void {
    const { width } = this.scale;
    this.promptText.setPosition(width / 2, 60);
    this.dateText.setPosition(width / 2, 44);
  }

  // ---------- Network ----------
  private async loadInit(): Promise<void> {
    try {
      const res = await fetch('/api/init');
      if (!res.ok) throw new Error(`init ${res.status}`);
      const data = (await res.json()) as InitResponse;
      this.applyData(data);
    } catch (err) {
      console.error('init failed', err);
      this.promptText.setText('Couldn’t reach the server. Try refreshing.');
    }
  }

  private async refresh(): Promise<void> {
    try {
      const res = await fetch('/api/refresh');
      if (!res.ok) return;
      const data = (await res.json()) as InitResponse;
      this.applyData(data);
    } catch {
      // silent; next tick will retry
    }
  }

  private applyData(data: InitResponse): void {
    this.state = {
      username: data.username,
      date: data.prompt.date,
      question: data.prompt.question,
      leftLabel: data.prompt.leftLabel,
      rightLabel: data.prompt.rightLabel,
      tally: data.tally,
      args: data.args,
      player: data.player,
    };
    this.promptText.setText(data.prompt.question);
    this.dateText.setText(`Take Sides · ${data.prompt.date} · u/${data.username}`);
    this.arena.update(data.tally);
    this.arena.syncFighters(data.args);
    this.renderPanel();
  }

  // ---------- DOM panel ----------
  private buildPanel(): void {
    const root = document.createElement('div');
    root.id = 'ts-panel';
    root.innerHTML = `
      <div class="ts-panel-bar">
        <div class="ts-panel-status" id="ts-status">Loading…</div>
        <button class="ts-collapse" id="ts-collapse" aria-label="Toggle panel">▾</button>
      </div>
      <div class="ts-panel-body" id="ts-body">
        <div class="ts-actions" id="ts-actions"></div>
        <div class="ts-args" id="ts-args"></div>
      </div>
    `;
    document.body.appendChild(root);
    this.panel = root;

    document.documentElement.style.setProperty('--ts-panel-height', '46vh');

    const collapseBtn = root.querySelector<HTMLButtonElement>('#ts-collapse')!;
    collapseBtn.addEventListener('click', () => {
      const collapsed = root.classList.toggle('ts-collapsed');
      document.documentElement.style.setProperty(
        '--ts-panel-height',
        collapsed ? '64px' : '46vh'
      );
      collapseBtn.textContent = collapsed ? '▴' : '▾';
      // Nudge Phaser to recompute the new canvas size.
      window.dispatchEvent(new Event('resize'));
    });
  }

  private renderPanel(): void {
    if (!this.panel || !this.state) return;
    const status = this.panel.querySelector<HTMLDivElement>('#ts-status')!;
    const actions = this.panel.querySelector<HTMLDivElement>('#ts-actions')!;
    const argsEl = this.panel.querySelector<HTMLDivElement>('#ts-args')!;
    const s = this.state;

    if (!s.player.hasSubmitted) {
      status.innerHTML = `<span class="ts-prompt">${escapeHtml(s.question)}</span>`;
      actions.innerHTML = `
        <button class="ts-cta" id="ts-pick">🪢 Pick your side</button>
      `;
      actions
        .querySelector<HTMLButtonElement>('#ts-pick')!
        .addEventListener('click', () => this.openSubmitModal());
    } else {
      const sideLabel =
        s.player.side === 'left' ? s.leftLabel : s.rightLabel;
      const sideClass = s.player.side === 'left' ? 'ts-left' : 'ts-right';
      const myArg = s.args.find((a) => a.id === s.player.argumentId);
      status.innerHTML = `
        <span class="ts-pill ${sideClass}">${escapeHtml(sideLabel)}</span>
        <span class="ts-mine">${myArg ? `“${escapeHtml(myArg.text)}”` : 'Your argument is on the rope.'}</span>
      `;
      actions.innerHTML = `<div class="ts-tip">Upvote arguments to add their pull to your side.</div>`;
    }

    // Argument cards.
    argsEl.innerHTML = '';
    for (const a of s.args) {
      const card = document.createElement('div');
      const sideClass = a.side === 'left' ? 'ts-left' : 'ts-right';
      const label = a.side === 'left' ? s.leftLabel : s.rightLabel;
      const isOwn = a.author === s.username;
      const alreadyUpvoted = s.player.upvotedArgIds.includes(a.id);
      card.className = `ts-card ${sideClass}`;
      card.innerHTML = `
        <div class="ts-card-head">
          <span class="ts-pill ${sideClass}">${escapeHtml(label)}</span>
          <span class="ts-author">u/${escapeHtml(a.author)}</span>
        </div>
        <div class="ts-text">${escapeHtml(a.text)}</div>
        <div class="ts-card-foot">
          <button class="ts-upvote ${alreadyUpvoted ? 'ts-on' : ''}" data-id="${a.id}" ${
            isOwn || alreadyUpvoted ? 'disabled' : ''
          }>
            ▲ ${a.upvotes}
          </button>
        </div>
      `;
      const btn = card.querySelector<HTMLButtonElement>('.ts-upvote');
      if (btn && !isOwn && !alreadyUpvoted) {
        btn.addEventListener('click', () => void this.upvote(a.id));
      }
      argsEl.appendChild(card);
    }
    if (s.args.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ts-empty';
      empty.textContent = 'No arguments yet. Be the first to pull the rope.';
      argsEl.appendChild(empty);
    }
  }

  private openSubmitModal(): void {
    if (!this.state) return;
    if (this.modal) this.modal.remove();
    const m = document.createElement('div');
    m.id = 'ts-modal';
    m.innerHTML = `
      <div class="ts-modal-card">
        <div class="ts-modal-title">${escapeHtml(this.state.question)}</div>
        <div class="ts-side-row">
          <button class="ts-side ts-left" data-side="left">${escapeHtml(this.state.leftLabel)}</button>
          <button class="ts-side ts-right" data-side="right">${escapeHtml(this.state.rightLabel)}</button>
        </div>
        <textarea class="ts-input" maxlength="${MAX_ARG_LENGTH}" placeholder="One line for your side..." rows="2"></textarea>
        <div class="ts-modal-foot">
          <button class="ts-cancel">Cancel</button>
          <button class="ts-submit" disabled>Submit</button>
        </div>
        <div class="ts-status" id="ts-modal-status"></div>
      </div>
    `;
    document.body.appendChild(m);
    this.modal = m;

    let chosenSide: Side | null = null;
    const sideButtons = m.querySelectorAll<HTMLButtonElement>('.ts-side');
    const submitBtn = m.querySelector<HTMLButtonElement>('.ts-submit')!;
    const textarea = m.querySelector<HTMLTextAreaElement>('.ts-input')!;
    const status = m.querySelector<HTMLDivElement>('#ts-modal-status')!;

    const updateSubmitEnabled = () => {
      submitBtn.disabled = !chosenSide || textarea.value.trim().length === 0;
    };

    sideButtons.forEach((b) => {
      b.addEventListener('click', () => {
        sideButtons.forEach((x) => x.classList.remove('ts-chosen'));
        b.classList.add('ts-chosen');
        chosenSide = (b.dataset.side as Side) ?? null;
        updateSubmitEnabled();
      });
    });
    textarea.addEventListener('input', updateSubmitEnabled);

    m.querySelector<HTMLButtonElement>('.ts-cancel')!.addEventListener(
      'click',
      () => {
        m.remove();
        delete this.modal;
      }
    );

    submitBtn.addEventListener('click', () => {
      if (!chosenSide) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      void this.submit(chosenSide, textarea.value, status, submitBtn, m);
    });

    setTimeout(() => textarea.focus(), 50);
  }

  private async submit(
    side: Side,
    text: string,
    status: HTMLDivElement,
    btn: HTMLButtonElement,
    modal: HTMLDivElement
  ): Promise<void> {
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ side, text }),
      });
      if (!res.ok) throw new Error(`submit ${res.status}`);
      const data = (await res.json()) as SubmitResponse;
      if (!data.ok) {
        status.textContent = data.message;
        btn.disabled = false;
        btn.textContent = 'Submit';
        return;
      }
      modal.remove();
      delete this.modal;
      // Refresh full state so the new fighter shows up on the rope.
      await this.refresh();
    } catch (err) {
      console.error('submit failed', err);
      status.textContent = 'Network error. Try again.';
      btn.disabled = false;
      btn.textContent = 'Submit';
    }
  }

  private async upvote(argumentId: string): Promise<void> {
    try {
      const res = await fetch('/api/upvote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ argumentId }),
      });
      if (!res.ok) throw new Error(`upvote ${res.status}`);
      const data = (await res.json()) as UpvoteResponse;
      if (!data.ok) return;
      this.arena.highlightFighter(argumentId);
      await this.refresh();
    } catch (err) {
      console.error('upvote failed', err);
    }
  }
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

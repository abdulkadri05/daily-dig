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
  type YesterdayResult,
} from '../../shared/api';
import { Arena } from './arena';

const REFRESH_MS = 8000;

type ClientState = {
  username: string;
  date: string;
  question: string;
  leftLabel: string;
  rightLabel: string;
  tally: Tally;
  args: Argument[];
  player: PlayerState;
  yesterday: YesterdayResult | null;
  playerCount: number;
};

export class Game extends Scene {
  private arena!: Arena;
  private promptText!: Phaser.GameObjects.Text;
  private dateText!: Phaser.GameObjects.Text;

  private state: ClientState | null = null;
  private prevUpvotes = new Map<string, number>();
  private prevPull = 0;
  private mvpLeftArgId: string | null = null;
  private mvpRightArgId: string | null = null;

  private panel?: HTMLDivElement;
  private modal?: HTMLDivElement;
  private toastTimer?: number;
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
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      delete this.toastTimer;
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
      this.applyData(data, /*initial*/ true);
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
      this.applyData(data, /*initial*/ false);
    } catch {
      // silent; next tick will retry
    }
  }

  private applyData(data: InitResponse, initial: boolean): void {
    // Detect deltas BEFORE we overwrite state.
    const myOldUpvotes = this.state?.player.argumentId
      ? this.prevUpvotes.get(this.state.player.argumentId) ?? 0
      : 0;
    const upvoteBumps: string[] = [];
    for (const a of data.args) {
      const prev = this.prevUpvotes.get(a.id);
      if (typeof prev === 'number' && a.upvotes > prev) {
        upvoteBumps.push(a.id);
      }
    }
    const newPull = data.tally.pull;
    const pullDelta = Math.abs(newPull - this.prevPull);

    // Recompute MVPs (top-power argument per side).
    let mvpLeft: Argument | null = null;
    let mvpRight: Argument | null = null;
    for (const a of data.args) {
      const power = 1 + a.upvotes;
      if (a.side === 'left') {
        const pl = mvpLeft ? 1 + mvpLeft.upvotes : -1;
        if (power > pl) mvpLeft = a;
      } else {
        const pr = mvpRight ? 1 + mvpRight.upvotes : -1;
        if (power > pr) mvpRight = a;
      }
    }
    this.mvpLeftArgId = mvpLeft ? mvpLeft.id : null;
    this.mvpRightArgId = mvpRight ? mvpRight.id : null;

    this.state = {
      username: data.username,
      date: data.prompt.date,
      question: data.prompt.question,
      leftLabel: data.prompt.leftLabel,
      rightLabel: data.prompt.rightLabel,
      tally: data.tally,
      args: data.args,
      player: data.player,
      yesterday: data.yesterday,
      playerCount: data.playerCount,
    };
    this.promptText.setText(data.prompt.question);
    const streakBit =
      data.player.streak > 1 ? ` · 🔥 ${data.player.streak}-day streak` : '';
    this.dateText.setText(
      `Take Sides · ${data.prompt.date} · u/${data.username}${streakBit}`
    );
    this.arena.update(data.tally);
    this.arena.syncFighters(data.args, {
      yourArgId: data.player.argumentId,
      mvpLeftArgId: this.mvpLeftArgId,
      mvpRightArgId: this.mvpRightArgId,
    });

    // Trigger juice only after the first load — otherwise initial fetch
    // would fire confetti for every existing argument.
    if (!initial) {
      for (const id of upvoteBumps) {
        this.arena.celebrateUpvote(id);
      }
      if (pullDelta > 0.08) {
        this.arena.shake(0.004 + Math.min(0.01, pullDelta * 0.02), 280);
      }
      const myArgId = data.player.argumentId;
      if (myArgId) {
        const myNewUpvotes =
          data.args.find((a) => a.id === myArgId)?.upvotes ?? 0;
        if (myNewUpvotes > myOldUpvotes) {
          this.showToast(
            `🔥 Someone upvoted your argument (+${myNewUpvotes - myOldUpvotes})`
          );
        }
      }
    }

    this.prevUpvotes.clear();
    for (const a of data.args) this.prevUpvotes.set(a.id, a.upvotes);
    this.prevPull = newPull;

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
        <div class="ts-yesterday" id="ts-yesterday" hidden></div>
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
      window.dispatchEvent(new Event('resize'));
    });
  }

  private renderPanel(): void {
    if (!this.panel || !this.state) return;
    const status = this.panel.querySelector<HTMLDivElement>('#ts-status')!;
    const actions = this.panel.querySelector<HTMLDivElement>('#ts-actions')!;
    const argsEl = this.panel.querySelector<HTMLDivElement>('#ts-args')!;
    const yEl = this.panel.querySelector<HTMLDivElement>('#ts-yesterday')!;
    const s = this.state;

    // Yesterday banner.
    if (s.yesterday && s.yesterday.winnerSide) {
      yEl.hidden = false;
      const winnerClass =
        s.yesterday.winnerSide === 'left'
          ? 'ts-left'
          : s.yesterday.winnerSide === 'right'
            ? 'ts-right'
            : 'ts-tie';
      yEl.innerHTML = `
        <div class="ts-y-head">
          <span class="ts-y-tag">Yesterday</span>
          <span class="ts-y-q">${escapeHtml(s.yesterday.question)}</span>
        </div>
        <div class="ts-y-row">
          <span class="ts-pill ${winnerClass}">${escapeHtml(s.yesterday.winnerLabel ?? 'Tie')}</span>
          <span class="ts-y-power">${s.yesterday.leftPower} vs ${s.yesterday.rightPower}</span>
        </div>
        ${
          s.yesterday.mvpAuthor
            ? `<div class="ts-y-mvp">👑 MVP: <strong>u/${escapeHtml(s.yesterday.mvpAuthor)}</strong> — “${escapeHtml(s.yesterday.mvpText ?? '')}” (${s.yesterday.mvpUpvotes} upvotes)</div>`
            : ''
        }
      `;
    } else {
      yEl.hidden = true;
    }

    // Status bar.
    if (!s.player.hasSubmitted) {
      status.innerHTML = `
        <span class="ts-prompt">${escapeHtml(s.question)}</span>
        <span class="ts-count">${s.playerCount} on the rope</span>
      `;
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
      const myUpvotes = myArg?.upvotes ?? 0;
      status.innerHTML = `
        <span class="ts-pill ${sideClass}">${escapeHtml(sideLabel)}</span>
        <span class="ts-mine">${myArg ? `“${escapeHtml(myArg.text)}”` : 'Your argument is on the rope.'}</span>
        <span class="ts-upcount">▲ ${myUpvotes}</span>
      `;
      actions.innerHTML = `
        <div class="ts-tip">Upvote arguments to pull harder for that side · ${s.playerCount} players today</div>
      `;
    }

    // Argument cards.
    argsEl.innerHTML = '';
    for (const a of s.args) {
      const card = document.createElement('div');
      const sideClass = a.side === 'left' ? 'ts-left' : 'ts-right';
      const label = a.side === 'left' ? s.leftLabel : s.rightLabel;
      const isOwn = a.author === s.username;
      const alreadyUpvoted = s.player.upvotedArgIds.includes(a.id);
      const isMvp =
        (a.side === 'left' && a.id === this.mvpLeftArgId) ||
        (a.side === 'right' && a.id === this.mvpRightArgId);
      const mvpBadge = isMvp ? `<span class="ts-mvp">👑 MVP</span>` : '';
      const youBadge = isOwn ? `<span class="ts-youbadge">⭐ You</span>` : '';
      card.className = `ts-card ${sideClass}${isOwn ? ' ts-own' : ''}${isMvp ? ' ts-is-mvp' : ''}`;
      card.innerHTML = `
        <div class="ts-card-head">
          <span class="ts-pill ${sideClass}">${escapeHtml(label)}</span>
          ${mvpBadge}
          ${youBadge}
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
      this.showToast(
        data.player.streak > 1
          ? `🪢 On the rope! 🔥 ${data.player.streak}-day streak`
          : '🪢 On the rope!'
      );
      this.arena.shake(0.006, 320);
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
      if (!data.ok) {
        this.showToast(data.message);
        return;
      }
      this.arena.celebrateUpvote(argumentId);
      await this.refresh();
    } catch (err) {
      console.error('upvote failed', err);
    }
  }

  private showToast(message: string): void {
    let toast = document.getElementById('ts-toast') as HTMLDivElement | null;
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ts-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('ts-show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast?.classList.remove('ts-show');
    }, 2400);
  }
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

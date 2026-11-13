<script lang="ts">
  import { untrack } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import Sheet from './Sheet.svelte';
  import Check from './Check.svelte';
  import Icon from './Icon.svelte';
  import { api } from '../api';
  import { store } from '../store.svelte';
  import { parseTrackerBlob, uniqueTrackers } from '../trackers';
  import { bytes, fileKind, shortHash } from '../format';
  import type { CommitResult, StagedInfo, StagedHealth } from '../types';

  let {
    staged,
    onclose,
    ondone
  }: {
    staged: StagedInfo;
    onclose: () => void;
    ondone: (result: CommitResult) => void;
  } = $props();

  const settings = $derived(store.settings!);

  let resolved = $state<StagedInfo | null>(null);
  const info = $derived(resolved ?? staged);
  let resolving = $state(false);
  let slow = $state(false);
  let adding = $state(false);
  let failed = $state<string | null>(null);

  // وضعیت Health Check
  let health = $state<StagedHealth | null>(null);
  let checkingHealth = $state(false);

  let downloadDir = $state(store.settings?.download_dir ?? '');
  let startPaused = $state(store.settings?.start_paused ?? false);
  let useAuto = $state(store.settings?.auto_apply_trackers ?? true);
  let extraPackIds = $state<string[]>([]);
  let extraText = $state('');
  let showExtra = $state(false);
  let excluded = $state<number[]>(untrack(() => [...staged.skipped]));
  let touchedFiles = $state(false);

  const autoPacks = $derived(settings.packs.filter((p) => p.enabled));
  const optionalPacks = $derived(settings.packs.filter((p) => !p.enabled));

  const chosenTrackers = $derived(
    info.private
      ? uniqueTrackers(info.trackers)
      : uniqueTrackers(
          info.trackers,
          useAuto ? autoPacks.flatMap((p) => p.trackers) : [],
          settings.packs.filter((p) => extraPackIds.includes(p.id)).flatMap((p) => p.trackers),
          parseTrackerBlob(extraText)
        )
  );

  const injected = $derived(chosenTrackers.length - info.trackers.length);
  const included = $derived(info.files.filter((f) => !excluded.includes(f.index)));
  const includedBytes = $derived(included.reduce((sum, f) => sum + f.length, 0));
  const totalBytes = $derived(info.total_bytes || includedBytes);

  let freeBytes = $state<number | null>(null);
  const neededBytes = $derived(includedBytes || totalBytes);
  const tooBig = $derived(freeBytes !== null && neededBytes > freeBytes);

  function measureSpace() {
    const folder = settings.incomplete_dir || downloadDir;
    api
      .freeSpace(folder)
      .then((free) => (freeBytes = free))
      .catch(() => (freeBytes = null));
  }
  measureSpace();

  const kindLabel = $derived(
    info.kind === 'magnet' ? 'Magnet link' : info.kind === 'url' ? 'Torrent URL' : 'Torrent file'
  );

  // تابع بررسی سلامت تورنت
  async function runHealthCheck(token: string) {
    checkingHealth = true;
    try {
      const res = await api.checkStagedHealth(token);
      health = res;
    } catch (e) {
      health = {
        seeds: 0,
        peers: 0,
        healthy: false,
        message: `Health check failed: ${e}`
      };
    } finally {
      checkingHealth = false;
    }
  }

  if (untrack(() => staged.needs_resolve)) {
    resolving = true;
    const quiet = setTimeout(() => (slow = true), 12000);
    api
      .resolveStaged(untrack(() => staged.token))
      .then((next) => {
        resolved = next;
        if (!touchedFiles) excluded = [...next.skipped];
        // پس از حل شدن متادیتا، بررسی سلامت را اجرا می‌کنیم
        runHealthCheck(next.token);
      })
      .catch((e) => {
        failed = String(e);
      })
      .finally(() => {
        clearTimeout(quiet);
        resolving = false;
      });
  } else {
    // اگر از قبل حل شده بود، مستقیم سلامت را چک کن
    runHealthCheck(staged.token);
  }

  function toggleFile(index: number, on: boolean) {
    touchedFiles = true;
    excluded = on ? excluded.filter((i) => i !== index) : [...excluded, index];
  }

  const skippedShown = $derived(
    info.files.filter((f) => info.skipped.includes(f.index) && excluded.includes(f.index))
  );

  function togglePack(id: string, on: boolean) {
    extraPackIds = on ? [...extraPackIds, id] : extraPackIds.filter((p) => p !== id);
  }

  async function chooseFolder() {
    const picked = await open({
      directory: true,
      multiple: false,
      defaultPath: downloadDir || store.homeDir,
      title: 'Choose where to save'
    });
    if (typeof picked === 'string') {
      downloadDir = picked;
      measureSpace();
    }
  }

  async function add() {
    adding = true;
    failed = null;
    try {
      const result = await api.commitStaged({
        token: info.token,
        download_dir: downloadDir,
        start_paused: startPaused,
        use_auto_packs: useAuto,
        pack_ids: extraPackIds,
        extra_trackers: parseTrackerBlob(extraText),
        selected_files: info.files.length > 1 ? included.map((f) => f.index) : null
      });
      ondone(result);
    } catch (e) {
      failed = String(e);
      adding = false;
    }
  }

  function cancel() {
    api.discardStaged(info.token).catch(() => {});
    onclose();
  }
</script>

<Sheet title="Add torrent & Health Check" subtitle={kindLabel} width={660} onclose={cancel}>
  <div class="identity">
    <span class="avatar" class:busy={resolving}>
      <Icon name={info.kind === 'file' ? 'file' : 'magnet'} size={18} />
    </span>
    <div class="who">
      <p class="title">{info.name ?? 'Untitled torrent'}</p>
      <p class="sub">
        {#if resolving}
          Reading details from the swarm…
        {:else if totalBytes > 0}
          <span class="num">{bytes(totalBytes)}</span>
          <span class="dot">·</span>
          {info.files.length === 1 ? '1 file' : `${info.files.length} files`}
        {:else}
          Details arrive once peers respond
        {/if}
        {#if info.info_hash}
          <span class="dot">·</span>
          <span class="mono">{shortHash(info.info_hash)}</span>
        {/if}
      </p>
    </div>
  </div>

  <!-- بخش نمایش وضعیت Health Check -->
  <section class="block health-section">
    <div class="head">
      <h3>Torrent Health Check</h3>
      {#if checkingHealth}
        <span class="tally">Checking swarm…</span>
      {:else if health}
        <span class="tally" class:healthy={health.healthy} class:unhealthy={!health.healthy}>
          {health.healthy ? '● Healthy (Seeds available)' : '● Poor / No Seeds'}
        </span>
      {/if}
    </div>
    {#if health}
      <div class="health-box" class:is-healthy={health.healthy} class:is-unhealthy={!health.healthy}>
        <Icon name={health.healthy ? 'check' : 'alert'} size={14} />
        <div class="health-info">
          <p><strong>Seeds:</strong> {health.seeds} | <strong>Peers:</strong> {health.peers}</p>
          <p class="msg">{health.message}</p>
        </div>
      </div>
    {/if}
  </section>

  <section class="block">
    <h3>Save to</h3>
    <div class="path">
      <input
        bind:value={downloadDir}
        onchange={measureSpace}
        spellcheck="false"
        aria-label="Download folder"
      />
      <button class="mini" onclick={chooseFolder}>Choose…</button>
    </div>
    {#if tooBig && freeBytes !== null}
      <p class="room short">
        <Icon name="alert" size={13} />
        This needs {bytes(neededBytes)} and only {bytes(freeBytes)} is free
      </p>
    {:else if freeBytes !== null}
      <p class="room">{bytes(freeBytes)} free</p>
    {/if}
  </section>

  <section class="block">
    <div class="head">
      <h3>Trackers</h3>
      <span class="tally" class:live={injected > 0}>
        {chosenTrackers.length} total{injected > 0 ? `, ${injected} added` : ''}
      </span>
    </div>

    {#if info.private}
      <p class="skipnote">
        <Icon name="lock" size={13} />
        <span>This is a private torrent. Only original trackers are used.</span>
      </p>
    {:else}
      <div class="packs">
        <Check
          bind:checked={useAuto}
          label="Add my tracker packs"
          hint={autoPacks.length === 0 ? 'No packs set' : `${autoPacks.length} packs`}
          disabled={autoPacks.length === 0}
        />
        {#each optionalPacks as pack (pack.id)}
          <Check
            checked={extraPackIds.includes(pack.id)}
            label={pack.name}
            hint="{pack.trackers.length} trackers"
            onchange={(on) => togglePack(pack.id, on)}
          />
        {/each}

        {#if showExtra}
          <div class="extra">
            <textarea
              bind:value={extraText}
              rows="3"
              spellcheck="false"
              placeholder="One tracker URL per line"
            ></textarea>
          </div>
        {:else}
          <button class="link" onclick={() => (showExtra = true)}>
            <Icon name="plus" size={13} stroke={2} />
            Paste extra trackers
          </button>
        {/if}
      </div>
    {/if}
  </section>

  {#if failed}
    <p class="failed"><Icon name="alert" size={14} />{failed}</p>
  {/if}

  {#snippet footer()}
    <Check bind:checked={startPaused} label="Start paused" />
    <span class="grow"></span>
    <button class="btn ghost" onclick={cancel}>Cancel</button>
    <button
      class="btn primary"
      onclick={add}
      disabled={adding || (info.files.length > 0 && included.length === 0)}
    >
      {adding ? 'Adding…' : 'Add torrent'}
    </button>
  {/snippet}
</Sheet>

<style>
  .identity { display: flex; align-items: center; gap: 13px; padding-bottom: 16px; border-bottom: 1px solid var(--line-soft); }
  .avatar { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r-md); background: var(--flow-wash); color: var(--flow); }
  .avatar.busy { animation: pulse 1.6s ease-in-out infinite; }
  .who { min-width: 0; }
  .title { margin: 0; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { margin: 3px 0 0; font-size: 11.5px; color: var(--ink-faint); }
  .dot { opacity: 0.5; margin: 0 5px; }
  .block { padding-top: 16px; }
  .block h3 { margin: 0 0 9px; font-size: 12px; font-weight: 600; color: var(--ink-dim); }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .tally { font-size: 11.5px; color: var(--ink-faint); }
  .tally.healthy { color: #10b981; font-weight: 600; }
  .tally.unhealthy { color: #ef4444; font-weight: 600; }
  .health-box { display: flex; align-items: flex-start; gap: 10px; margin-top: 8px; padding: 10px 12px; border-radius: var(--r-md); font-size: 12px; line-height: 1.4; }
  .health-box.is-healthy { background: rgba(16, 185, 129, 0.1); color: #065f46; border: 1px solid rgba(16, 185, 129, 0.2); }
  .health-box.is-unhealthy { background: rgba(239, 68, 68, 0.1); color: #991b1b; border: 1px solid rgba(239, 68, 68, 0.2); }
  .health-info .msg { margin: 3px 0 0; opacity: 0.85; }
  .path { display: flex; gap: 8px; }
  .path input { flex: 1; min-width: 0; height: 30px; padding: 0 10px; border: 1px solid var(--line-soft); border-radius: var(--r-md); background: var(--ground); font-size: 12.5px; }
  .mini { flex: none; height: 30px; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); color: var(--ink-dim); font-size: 12.5px; }
  .packs { display: flex; flex-direction: column; gap: 11px; }
  .extra textarea { width: 100%; padding: 9px 10px; border: 1px solid var(--line-soft); border-radius: var(--r-md); background: var(--ground); font-family: var(--mono); font-size: 11.5px; }
  .link { display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: var(--accent); font-size: 12px; cursor: pointer; }
  .failed { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; padding: 10px 12px; border-radius: var(--r-md); background: var(--alarm-wash); color: var(--alarm); font-size: 12px; }
  .grow { flex: 1; }
  .btn { height: 30px; padding: 0 14px; border-radius: var(--r-md); border: 1px solid transparent; font-size: 12.5px; font-weight: 550; }
  .btn.ghost { border-color: var(--line); background: transparent; color: var(--ink-dim); }
  .btn.primary { background: var(--accent); color: var(--accent-ink); }
</style>

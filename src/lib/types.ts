export type TorrentState =
  | 'queued'
  | 'checking'
  | 'downloading'
  | 'seeding'
  | 'paused'
  | 'stopped'
  | 'moving'
  | 'error'
  | 'finished';

export interface TorrentRow {
  id: number;
  info_hash: string;
  name: string;
  state: TorrentState;
  progress_bytes: number;
  total_bytes: number;
  down_speed: number;
  up_speed: number;
  eta_seconds: number | null;
  ratio: number;
  peers_live: number;
  peers_connecting: number;
  peers_queued: number;
  peers_seen: number;
  output_folder: string;
  tracker_count: number;
  issue: string | null;
  has_metadata: boolean;
  selected_bytes: number;
  added_at: number;
  completed_at: number | null;
}

export interface SessionSummary {
  version: string;
  git_commit: string | null;
  download_dir: string;
  listen_port: number | null;
  active_downloads: number;
  active_seeds: number;
  peers_live: number;
  peers_connecting: number;
  peers_seen: number;
  downloaded_session_bytes: number;
  uploaded_session_bytes: number;
  dht_nodes: number;
  issues_count: number;
}

export interface FeedStatus {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  interval_minutes: number;
  last_checked_at: number | null;
  last_status: string | null;
  items_count: number;
  unread_count: number;
}

export interface PeerEntry {
  addr: string;
  state: string;
  conn_kind: string;
  client: string | null;
  down: number;
  up: number;
  progress: number;
}

export interface TorrentDetail {
  id: number;
  info_hash: string;
  name: string;
  state: TorrentState;
  progress_bytes: number;
  total_bytes: number;
  down_speed: number;
  up_speed: number;
  eta_seconds: number | null;
  ratio: number;
  peers_live: number;
  peers_connecting: number;
  peers_seen: number;
  output_folder: string;
  tracker_count: number;
  issue: string | null;
  has_metadata: boolean;
  selected_bytes: number;
  added_at: number;
  completed_at: number | null;
  files: Array<{
    index: number;
    name: string;
    length: number;
    progress: number;
    selected: boolean;
  }>;
  trackers: Array<{
    url: string;
    state: string;
    next_announce: number | null;
    last_error: string | null;
  }>;
  peers: Record<string, unknown>;
  piece_size: number;
  pieces_count: number;
  pieces_have: number;
  comment: string | null;
  created_by: string | null;
  created_at: number | null;
  private: boolean;
}

export interface ActivityEntry {
  id: number;
  timestamp: number;
  kind: string;
  message: string;
  info_hash: string | null;
}

export interface BlocklistStatus {
  path: string | null;
  enabled: boolean;
  rules_count: number;
  error: string | null;
}

export interface Bootstrap {
  version: string;
  git_commit: string | null;
  torrents: TorrentRow[];
  session: SessionSummary;
  settings: Settings;
  activity: ActivityEntry[];
  feeds: Record<string, FeedStatus>;
}

export interface Settings {
  download_dir: string;
  start_paused: boolean;
  max_active_downloads: number;
  peer_limit_per_torrent: number;
  blocklist_path: string | null;
  blocklist_enabled: boolean;
  max_active_seeds: number;
  seed_ratio_limit: number;
  seed_time_limit_minutes: number;
  active_trackers: string[];
  extra_trackers: string[];
  auto_apply_trackers: boolean;
  feeds: FeedStatus[];
}

export interface ApplyTrackersResult {
  added: number;
  ignored: number;
  total: number;
}

export interface BulkApplyResult {
  affected: number;
  added: number;
}

export interface EngineInfo {
  version: string;
  git_commit: string | null;
}

export interface NetInterface {
  name: string;
  addr: string;
}

export interface StagedFile {
  index: number;
  name: string;
  components: string[];
  length: number;
}

export interface StagedInfo {
  token: string;
  kind: 'magnet' | 'file' | 'url';
  source: string;
  info_hash: string | null;
  name: string | null;
  total_bytes: number;
  trackers: string[];
  files: StagedFile[];
  skipped: number[];
  resolved: boolean;
  needs_resolve: boolean;
  private: boolean;
}

// اضافه شدن اینترفیس مربوط به بررسی سلامت تورنت پیش از افزودن
export interface StagedHealth {
  seeds: number;
  peers: number;
  healthy: boolean;
  message: string;
}

export interface CommitResult {
  /** Null while the add is still waiting for metadata. */
  id: number | null;
  name: string;
  tracker_count: number;
  pending: boolean;
  /** The torrent was in the list already, so nothing new was added. */
  already: boolean;
}

/** A confirmed add that is still waiting for peers to send its metadata. */
export interface PendingAdd {
  token: string;
  name: string;
  info_hash: string | null;
  waiting_seconds: number;
}

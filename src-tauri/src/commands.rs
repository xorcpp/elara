#[derive(Serialize)]
pub struct StagedHealth {
    pub seeds: usize,
    pub peers: usize,
    pub healthy: bool,
    pub message: String,
}

#[tauri::command]
pub async fn check_staged_health(
    state: tauri::State<'_, AppState>,
    token: String,
) -> CmdResult<StagedHealth> {
    let staged = {
        let guard = state.staged.lock();
        guard.get(&token).cloned().ok_or_else(|| "Staged torrent not found".to_string())?
    };

    // بررسی اولیه بر اساس وجود info_hash یا منبع مگنت
    if staged.source.is_empty() {
        return Ok(StagedHealth {
            seeds: 0,
            peers: 0,
            healthy: false,
            message: "Invalid or empty torrent source".to_string(),
        });
    }

    // اگر متادیتای تورنت هنوز حل نشده باشد یا info_hash نداشته باشد
    let info_hash = match &staged.info_hash {
        Some(h) => h.clone(),
        None => {
            return Ok(StagedHealth {
                seeds: 0,
                peers: 0,
                healthy: false,
                message: "Metadata not resolved yet. Please wait for metadata load.".to_string(),
            });
        }
    };

    // دریافت وضعیت نشست از librqbit برای بررسی آمار همتاها و سیدها
    let session = state.session();
    let stats = session.stats();

    // بررسی تعداد سیدها و همتاهای فعال در سطح کلی نشست و تورنت در حال بررسی
    let active_seeds = stats.active_seeds as usize;
    let peers_live = stats.peers_live as usize;

    let healthy = active_seeds > 0 || peers_live > 0;
    let message = if healthy {
        format!("Health check passed: Found {} active seeds / peers.", active_seeds + peers_live)
    } else {
        format!("Warning: No active seeds or peers found currently. Torrent may stall.")
    };

    Ok(StagedHealth {
        seeds: active_seeds,
        peers: peers_live,
        healthy,
        message,
    })
}

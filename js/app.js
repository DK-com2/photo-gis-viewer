// グローバル変数
let fileHandler;
let exifHandler;
let mapHandler;
let photoModal;

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // ハンドラーの初期化
    fileHandler = new FileHandler();
    exifHandler = new ExifHandler();
    mapHandler = new MapHandler('map');
    photoModal = new PhotoModal();

    // 地図の初期化
    mapHandler.initializeMap();

    // イベントリスナーの設定
    setupEventListeners();

    // ブラウザサポートチェック
    checkBrowserSupport();
}

function setupEventListeners() {
    // フォルダ選択ボタン
    const selectFolderBtn = document.getElementById('selectFolder');
    selectFolderBtn.addEventListener('click', handleFolderSelection);

    // フィルターボタン
    const applyFiltersBtn = document.getElementById('applyFilters');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const toggleFiltersBtn = document.getElementById('toggleFilters');
    
    applyFiltersBtn.addEventListener('click', handleApplyFilters);
    clearFiltersBtn.addEventListener('click', handleClearFilters);
    toggleFiltersBtn.addEventListener('click', toggleFilters);

    // モーダルのクローズ
    const modal = document.getElementById('photoModal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.addEventListener('click', () => {
        photoModal.hideModal();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            photoModal.hideModal();
        }
    });

    // ESCキーでモーダルを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            photoModal.hideModal();
        }
    });

    // ウィンドウリサイズ時の地図調整
    window.addEventListener('resize', () => {
        mapHandler.resize();
    });
}

function checkBrowserSupport() {
    if (!fileHandler.isSupported()) {
        showError('お使いのブラウザはフォルダ選択に対応していません。Chrome または Edge の最新版をご利用ください。');
        document.getElementById('selectFolder').disabled = true;
    }
}

async function handleFolderSelection() {
    const selectBtn = document.getElementById('selectFolder');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    try {
        // ボタンを無効化
        selectBtn.disabled = true;
        selectBtn.textContent = '処理中...';
        
        // エラー表示をクリア
        hideError();
        
        // ローディング表示
        showLoading();

        // フォルダ選択
        const imageFiles = await fileHandler.selectFolder();
        
        if (imageFiles.length === 0) {
            throw new Error('選択したフォルダに画像ファイルが見つかりませんでした。');
        }

        // EXIF情報の処理
        const results = await exifHandler.processFiles(imageFiles, updateProgress);

        // 地図にマーカーを追加
        const markerCount = await mapHandler.addPhotosToMap(results.photosWithGPS);

        // UI更新
        updatePhotoCount(results.totalCount, results.gpsCount);
        setupFilters(results.photosWithGPS);
        
        // 結果メッセージ
        if (results.gpsCount === 0) {
            showError('位置情報のある写真が見つかりませんでした。');
        } else {
            console.log(`${results.gpsCount}枚の写真を地図に表示しました。`);
            updateVisibleCount(results.gpsCount);
        }

    } catch (error) {
        console.error('エラー:', error);
        showError(error.message);
    } finally {
        // ローディング非表示
        hideLoading();
        
        // ボタンを再有効化
        selectBtn.disabled = false;
        selectBtn.textContent = '📁 フォルダを選択';
    }
}

function updateProgress(current, total, filename) {
    const loadingDiv = document.getElementById('loading');
    const progressText = loadingDiv.querySelector('p');
    
    if (progressText) {
        progressText.textContent = `写真を処理中... (${current}/${total}) ${filename}`;
    }
}

function updatePhotoCount(totalCount, gpsCount) {
    document.getElementById('photoCount').textContent = `${totalCount}枚の写真`;
    document.getElementById('gpsCount').textContent = `${gpsCount}枚に位置情報あり`;
}

function updateVisibleCount(visibleCount) {
    document.getElementById('visibleCount').textContent = `${visibleCount}枚表示中`;
}

// フィルターの初期化
function setupFilters(photosWithGPS) {
    if (photosWithGPS.length === 0) return;
    
    // フィルタートグルボタンを表示
    document.getElementById('toggleFilters').classList.remove('hidden');
    
    // 日付範囲の初期値を設定
    const dates = photosWithGPS
        .filter(photo => photo.dateTime)
        .map(photo => photo.dateTime)
        .sort();
    
    if (dates.length > 0) {
        const startDate = new Date(dates[0]);
        const endDate = new Date(dates[dates.length - 1]);
        
        document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
        document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
    }
    
    // カメラフィルターのオプションを作成
    const cameraSelect = document.getElementById('cameraFilter');
    cameraSelect.innerHTML = '<option value="">すべて</option>';
    
    const cameras = new Set();
    photosWithGPS.forEach(photo => {
        if (photo.camera && photo.camera.make) {
            const cameraName = `${photo.camera.make} ${photo.camera.model || ''}`.trim();
            cameras.add(cameraName);
        }
    });
    
    Array.from(cameras).sort().forEach(camera => {
        const option = document.createElement('option');
        option.value = camera;
        option.textContent = camera;
        cameraSelect.appendChild(option);
    });
}

// フィルター表示のトグル
function toggleFilters() {
    const filtersSection = document.getElementById('filtersSection');
    const toggleBtn = document.getElementById('toggleFilters');
    
    if (filtersSection.classList.contains('collapsed')) {
        // 展開
        filtersSection.classList.remove('collapsed');
        filtersSection.classList.add('expanded');
        toggleBtn.textContent = '▲ フィルターを閉じる';
        toggleBtn.classList.remove('btn-outline');
        toggleBtn.classList.add('btn-secondary');
    } else {
        // 折りたたみ
        filtersSection.classList.remove('expanded');
        filtersSection.classList.add('collapsed');
        toggleBtn.textContent = '🔍 フィルター';
        toggleBtn.classList.remove('btn-secondary');
        toggleBtn.classList.add('btn-outline');
    }
}

// フィルター適用
function handleApplyFilters() {
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
    const selectedCamera = document.getElementById('cameraFilter').value;
    
    let filteredPhotos = exifHandler.getPhotosWithGPS();
    let filtersApplied = false;
    
    // 日付フィルター
    if (startDateStr || endDateStr) {
        const startDate = startDateStr ? new Date(startDateStr) : new Date('1900-01-01');
        const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : new Date();
        
        filteredPhotos = filteredPhotos.filter(photo => {
            if (!photo.dateTime) return false;
            return photo.dateTime >= startDate && photo.dateTime <= endDate;
        });
        filtersApplied = true;
    }
    
    // カメラフィルター
    if (selectedCamera) {
        filteredPhotos = filteredPhotos.filter(photo => {
            if (!photo.camera) return false;
            const cameraName = `${photo.camera.make || ''} ${photo.camera.model || ''}`.trim();
            return cameraName === selectedCamera;
        });
        filtersApplied = true;
    }
    
    // 地図更新
    mapHandler.updateMarkersVisibility(filteredPhotos);
    updateVisibleCount(filteredPhotos.length);
    
    // フィルター状態の表示更新
    updateFilterStatus(filtersApplied);
    
    console.log(`フィルター適用: ${filteredPhotos.length}枚表示`);
}

// フィルタークリア
function handleClearFilters() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('cameraFilter').value = '';
    
    const allPhotos = exifHandler.getPhotosWithGPS();
    mapHandler.updateMarkersVisibility(allPhotos);
    updateVisibleCount(allPhotos.length);
    
    // フィルター状態をリセット
    updateFilterStatus(false);
    
    console.log('フィルターをクリアしました');
}

// フィルター状態の表示更新
function updateFilterStatus(isActive) {
    const toggleBtn = document.getElementById('toggleFilters');
    
    if (isActive) {
        toggleBtn.style.background = '#28a745';
        toggleBtn.style.color = 'white';
        toggleBtn.style.borderColor = '#28a745';
        if (toggleBtn.textContent === '🔍 フィルター') {
            toggleBtn.textContent = '🔍 フィルター (有効)';
        }
    } else {
        toggleBtn.style.background = '';
        toggleBtn.style.color = '';
        toggleBtn.style.borderColor = '';
        if (toggleBtn.textContent.includes('(有効)')) {
            toggleBtn.textContent = '🔍 フィルター';
        }
    }
}

function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    
    // 5秒後に自動的に非表示
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

// フォトモーダルクラス
class PhotoModal {
    constructor() {
        this.modal = document.getElementById('photoModal');
        this.modalImage = document.getElementById('modalImage');
        this.modalInfo = document.getElementById('modalInfo');
        this.currentPhoto = null;
    }

    async showPhoto(filename) {
        try {
            // 写真データを検索
            const photo = exifHandler.getPhotosWithGPS().find(p => p.filename === filename);
            if (!photo) {
                console.warn('写真が見つかりません:', filename);
                return;
            }

            this.currentPhoto = photo;

            // 画像を読み込み
            const imageUrl = await fileHandler.readFileAsDataURL(photo.file);
            this.modalImage.src = imageUrl;
            this.modalImage.alt = photo.filename;

            // 写真情報を表示
            this.displayPhotoInfo(photo);

            // モーダルを表示
            this.modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // 背景スクロール防止

        } catch (error) {
            console.error('写真表示エラー:', error);
            showError('写真の表示に失敗しました。');
        }
    }

    displayPhotoInfo(photo) {
        const info = exifHandler.formatPhotoInfo(photo);
        
        let infoHtml = `<h3>📷 ${info.filename}</h3>`;
        
        // 撮影情報セクション
        if (info.dateTime || info.camera || info.lens || info.settings) {
            infoHtml += `<div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">`;
            infoHtml += `<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 14px; font-weight: 600;">撮影情報</h4>`;
            
            if (info.dateTime) {
                infoHtml += `<p style="margin: 5px 0;"><strong>📅 撮影日時:</strong> ${info.dateTime}</p>`;
            }
            
            if (info.camera) {
                infoHtml += `<p style="margin: 5px 0;"><strong>📷 カメラ:</strong> ${info.camera}</p>`;
            }
            
            if (info.lens) {
                infoHtml += `<p style="margin: 5px 0;"><strong>🔍 レンズ:</strong> ${info.lens}</p>`;
            }
            
            if (info.settings) {
                infoHtml += `<p style="margin: 5px 0;"><strong>⚙️ 設定:</strong> ${info.settings}</p>`;
            }
            
            infoHtml += `</div>`;
        }
        
        // ファイル情報セクション
        infoHtml += `<div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 6px;">`;
        infoHtml += `<h4 style="margin: 0 0 10px 0; color: #495057; font-size: 14px; font-weight: 600;">ファイル情報</h4>`;
        infoHtml += `<p style="margin: 5px 0;"><strong>📍 位置情報:</strong> ${info.coordinates}</p>`;
        infoHtml += `<p style="margin: 5px 0;"><strong>📁 サイズ:</strong> ${info.fileSize}</p>`;
        infoHtml += `<p style="margin: 5px 0; word-break: break-all;"><strong>📂 パス:</strong> ${info.path}</p>`;
        infoHtml += `</div>`;

        this.modalInfo.innerHTML = infoHtml;
    }

    hideModal() {
        this.modal.classList.add('hidden');
        document.body.style.overflow = ''; // 背景スクロール復元
        this.currentPhoto = null;
    }
}

// キーボードショートカット
document.addEventListener('keydown', function(e) {
    // Ctrl+O でフォルダ選択
    if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        if (!document.getElementById('selectFolder').disabled) {
            handleFolderSelection();
        }
    }
});

// エラーハンドリング
window.addEventListener('error', function(e) {
    console.error('予期しないエラー:', e.error);
    showError('予期しないエラーが発生しました。ページを再読み込みしてください。');
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('処理されていないPromise拒否:', e.reason);
    showError('処理中にエラーが発生しました。');
});

// デバッグ用（開発時のみ）
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.debug = {
        fileHandler: () => fileHandler,
        exifHandler: () => exifHandler,
        mapHandler: () => mapHandler,
        photoModal: () => photoModal
    };
}
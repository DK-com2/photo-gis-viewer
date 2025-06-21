// 軽量版 Photo GIS Viewer - 本番環境用
// グローバル変数
let fileHandler;
let exifHandler;
let mapHandler;
let photoModal;

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeLiteApp();
});

function initializeLiteApp() {
    // ハンドラーの初期化
    fileHandler = new FileHandler();
    exifHandler = new ExifHandler();
    mapHandler = new LiteMapHandler('map'); // 軽量版マップハンドラー
    photoModal = new LitePhotoModal(); // 軽量版フォトモーダル

    // 地図の初期化
    mapHandler.initializeMap();

    // イベントリスナーの設定
    setupEventListeners();

    // ブラウザサポートチェック
    checkBrowserSupport();

    console.log('⚡ Photo GIS Viewer 軽量版初期化完了');
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

    try {
        // ボタンを無効化
        selectBtn.disabled = true;
        selectBtn.textContent = '処理中...';
        
        // エラー表示をクリア
        hideError();
        
        // ローディング表示
        showLoading();

        // フォルダ選択（軽量版では最小限のデータのみ保持）
        const imageFiles = await fileHandler.selectFolderLite();
        
        if (imageFiles.length === 0) {
            throw new Error('選択したフォルダに画像ファイルが見つかりませんでした。');
        }

        // EXIF情報の処理（軽量版）
        const results = await exifHandler.processFilesLite(imageFiles, updateProgress);

        // 地図にマーカーを追加（軽量版）
        const markerCount = await mapHandler.addPhotosToMapLite(results.photosWithGPS);

        // UI更新
        updatePhotoCount(results.totalCount, results.gpsCount);
        setupFilters(results.photosWithGPS);
        
        // 結果メッセージ
        if (results.gpsCount === 0) {
            showError('位置情報のある写真が見つかりませんでした。');
        } else {
            console.log(`⚡ ${results.gpsCount}枚の写真を軽量モードで表示しました。`);
            updateVisibleCount(results.gpsCount);
            
            // メモリ使用量をログ出力（詳細ボタンなし）
            if (performance.memory) {
                const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                console.log(`📊 メモリ使用量: ${usedMB}MB (軽量版)`);
            }
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

// 軽量版マップハンドラー
class LiteMapHandler extends MapHandler {
    constructor(mapElementId) {
        super(mapElementId);
        this.visibleMarkers = new Set(); // 表示中のマーカーのみ追跡
    }

    // ポップアップは最小限の情報のみ（画像なし）
    async createPopupContent(photo) {
        const photoInfo = exifHandler.formatPhotoInfo(photo);
        
        return `
            <div class="popup-content-lite">
                <div class="popup-info">
                    <strong>${photo.filename}</strong><br>
                    ${photoInfo.dateTime ? `📅 ${photoInfo.dateTime}<br>` : ''}
                    ${photoInfo.camera ? `📷 ${photoInfo.camera}<br>` : ''}
                    📍 ${photoInfo.coordinates}
                    <br><button onclick="photoModal.showPhoto('${photo.filename}')" class="btn-small">📷 表示</button>
                </div>
            </div>
        `;
    }

    // 軽量版マーカー追加
    async addPhotosToMapLite(photosWithGPS) {
        this.clearMarkers();
        this.photoData = photosWithGPS;

        if (photosWithGPS.length === 0) {
            return 0;
        }

        console.log(`⚡ 軽量モードで${photosWithGPS.length}個のマーカーを作成中...`);

        // マーカーを段階的に追加（メモリ負荷を分散）
        const batchSize = 50;
        let processed = 0;

        for (let i = 0; i < photosWithGPS.length; i += batchSize) {
            const batch = photosWithGPS.slice(i, i + batchSize);
            
            for (const photo of batch) {
                try {
                    const marker = await this.createPhotoMarker(photo);
                    
                    if (this.markerCluster) {
                        this.markerCluster.addLayer(marker);
                    } else {
                        marker.addTo(this.map);
                    }
                    
                    this.markers.push(marker);
                    processed++;
                } catch (error) {
                    console.warn(`マーカー作成エラー (${photo.filename}):`, error);
                }
            }

            // UI応答性のため少し待機
            if (i + batchSize < photosWithGPS.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        // 表示範囲調整
        this.fitMapToPhotos();

        console.log(`✅ ${processed}個のマーカーを軽量モードで追加完了`);
        return processed;
    }
}

// 軽量版フォトモーダル
class LitePhotoModal {
    constructor() {
        this.modal = document.getElementById('photoModal');
        this.modalImage = document.getElementById('modalImage');
        this.modalInfo = document.getElementById('modalInfo');
        this.currentPhoto = null;
        this.imageCache = new Map(); // 最小限のキャッシュ（5枚まで）
        this.maxCache = 5;
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

            // キャッシュから取得を試行
            let imageUrl = this.imageCache.get(filename);
            
            if (!imageUrl) {
                // キャッシュにない場合のみ読み込み
                imageUrl = await fileHandler.readImageAsDataURL(photo.filePath);
                
                // キャッシュサイズ管理
                if (this.imageCache.size >= this.maxCache) {
                    const oldestKey = this.imageCache.keys().next().value;
                    this.imageCache.delete(oldestKey);
                }
                
                this.imageCache.set(filename, imageUrl);
                console.log(`🖼️ 画像をキャッシュ: ${filename} (${this.imageCache.size}/${this.maxCache})`);
            } else {
                console.log(`📋 キャッシュヒット: ${filename}`);
            }

            this.modalImage.src = imageUrl;
            this.modalImage.alt = photo.filename;

            // 写真情報を表示
            this.displayPhotoInfo(photo);

            // モーダルを表示
            this.modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

        } catch (error) {
            console.error('写真表示エラー:', error);
            showError('写真の表示に失敗しました。');
        }
    }

    displayPhotoInfo(photo) {
        const info = exifHandler.formatPhotoInfo(photo);
        
        let infoHtml = `<h3>📷 ${info.filename}</h3>`;
        
        // 撮影情報セクション（軽量版では簡素化）
        if (info.dateTime || info.camera) {
            infoHtml += `<div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 6px;">`;
            
            if (info.dateTime) {
                infoHtml += `<p style="margin: 5px 0;"><strong>📅 撮影日時:</strong> ${info.dateTime}</p>`;
            }
            
            if (info.camera) {
                infoHtml += `<p style="margin: 5px 0;"><strong>📷 カメラ:</strong> ${info.camera}</p>`;
            }
            
            infoHtml += `</div>`;
        }
        
        // ファイル情報セクション
        infoHtml += `<div style="margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 6px;">`;
        infoHtml += `<p style="margin: 5px 0;"><strong>📍 位置情報:</strong> ${info.coordinates}</p>`;
        if (info.fileSize) {
            infoHtml += `<p style="margin: 5px 0;"><strong>📁 サイズ:</strong> ${info.fileSize}</p>`;
        }
        infoHtml += `</div>`;

        this.modalInfo.innerHTML = infoHtml;
    }

    hideModal() {
        this.modal.classList.add('hidden');
        document.body.style.overflow = '';
        this.currentPhoto = null;
    }
}

// 進捗更新
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

// 簡素化されたフィルター機能
function setupFilters(photosWithGPS) {
    if (photosWithGPS.length === 0) return;
    
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
    
    // カメラフィルター
    const cameraSelect = document.getElementById('cameraFilter');
    cameraSelect.innerHTML = '<option value="">すべて</option>';
    
    const cameras = [...new Set(photosWithGPS
        .filter(photo => photo.camera && photo.camera.make)
        .map(photo => `${photo.camera.make} ${photo.camera.model || ''}`.trim())
    )];
    
    cameras.sort().forEach(camera => {
        const option = document.createElement('option');
        option.value = camera;
        option.textContent = camera;
        cameraSelect.appendChild(option);
    });
}

function toggleFilters() {
    const filtersSection = document.getElementById('filtersSection');
    const toggleBtn = document.getElementById('toggleFilters');
    
    if (filtersSection.classList.contains('collapsed')) {
        filtersSection.classList.remove('collapsed');
        filtersSection.classList.add('expanded');
        toggleBtn.textContent = '▲ フィルターを閉じる';
        toggleBtn.classList.remove('btn-outline');
        toggleBtn.classList.add('btn-secondary');
    } else {
        filtersSection.classList.remove('expanded');
        filtersSection.classList.add('collapsed');
        toggleBtn.textContent = '🔍 フィルター';
        toggleBtn.classList.remove('btn-secondary');
        toggleBtn.classList.add('btn-outline');
    }
}

function handleApplyFilters() {
    const startDateStr = document.getElementById('startDate').value;
    const endDateStr = document.getElementById('endDate').value;
    const selectedCamera = document.getElementById('cameraFilter').value;
    
    let filteredPhotos = exifHandler.getPhotosWithGPS();
    
    if (startDateStr || endDateStr) {
        const startDate = startDateStr ? new Date(startDateStr) : new Date('1900-01-01');
        const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : new Date();
        
        filteredPhotos = filteredPhotos.filter(photo => {
            if (!photo.dateTime) return false;
            return photo.dateTime >= startDate && photo.dateTime <= endDate;
        });
    }
    
    if (selectedCamera) {
        filteredPhotos = filteredPhotos.filter(photo => {
            if (!photo.camera) return false;
            const cameraName = `${photo.camera.make || ''} ${photo.camera.model || ''}`.trim();
            return cameraName === selectedCamera;
        });
    }
    
    mapHandler.updateMarkersVisibility(filteredPhotos);
    updateVisibleCount(filteredPhotos.length);
    
    console.log(`⚡ 軽量版フィルター適用: ${filteredPhotos.length}枚表示`);
}

function handleClearFilters() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('cameraFilter').value = '';
    
    const allPhotos = exifHandler.getPhotosWithGPS();
    mapHandler.updateMarkersVisibility(allPhotos);
    updateVisibleCount(allPhotos.length);
    
    console.log('⚡ 軽量版フィルターをクリアしました');
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
    
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

// エラーハンドリング
window.addEventListener('error', function(e) {
    console.error('軽量版エラー:', e.error);
    showError('予期しないエラーが発生しました。');
});

// デバッグ用（軽量版情報）
console.log('⚡ Photo GIS Viewer 軽量版スクリプト読み込み完了');

if (typeof window !== 'undefined') {
    window.liteDebug = {
        version: 'lite',
        fileHandler: () => fileHandler,
        exifHandler: () => exifHandler,
        mapHandler: () => mapHandler,
        photoModal: () => photoModal
    };
}
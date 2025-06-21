class MapHandler {
    constructor(mapElementId) {
        this.mapElementId = mapElementId;
        this.map = null;
        this.markers = [];
        this.markerCluster = null;
        this.photoData = [];
    }

    // 地図の初期化
    initializeMap() {
        // 日本の中心付近を初期位置に設定
        const defaultView = [35.6762, 139.6503]; // 東京
        const defaultZoom = 10;

        this.map = L.map(this.mapElementId).setView(defaultView, defaultZoom);

        // 複数のタイルレイヤーを定義
        const baseLayers = {
            'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }),
            
            '衛星画像 (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics',
                maxZoom: 18
            }),
            
            'CartoDB (明るい)': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © CartoDB',
                maxZoom: 19
            }),
            
            'CartoDB (暗い)': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap © CartoDB',
                maxZoom: 19
            }),
            
            '地形図': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenTopoMap (CC-BY-SA)',
                maxZoom: 17
            })
        };

        // デフォルトレイヤーを追加
        baseLayers['OpenStreetMap'].addTo(this.map);
        
        // レイヤー切り替えコントロールを追加
        L.control.layers(baseLayers).addTo(this.map);

        // マーカークラスタリングの初期化（CDNから読み込み）
        if (typeof L.markerClusterGroup !== 'undefined') {
            this.markerCluster = L.markerClusterGroup({
                chunkedLoading: true,
                maxClusterRadius: 50
            });
            this.map.addLayer(this.markerCluster);
        }

        return this.map;
    }

    // 写真データを地図に追加
    async addPhotosToMap(photosWithGPS) {
        this.clearMarkers();
        this.photoData = photosWithGPS;

        if (photosWithGPS.length === 0) {
            this.showMessage('位置情報のある写真が見つかりませんでした。', 'info');
            return;
        }

        const markers = [];

        for (const photo of photosWithGPS) {
            try {
                const marker = await this.createPhotoMarker(photo);
                markers.push(marker);
            } catch (error) {
                console.warn(`マーカー作成エラー (${photo.filename}):`, error);
            }
        }

        // マーカーを地図に追加
        if (this.markerCluster) {
            this.markerCluster.addLayers(markers);
        } else {
            markers.forEach(marker => marker.addTo(this.map));
        }

        this.markers = markers;

        // 全ての写真が見えるように地図の表示範囲を調整
        this.fitMapToPhotos();

        return markers.length;
    }

    // 個別の写真マーカーを作成
    async createPhotoMarker(photo) {
        const lat = photo.latitude;
        const lng = photo.longitude;

        // カスタムアイコンの作成
        const pinColor = this.getPinColor(photo);
        const photoIcon = L.divIcon({
            className: `photo-marker-pin ${pinColor}`,
            html: '<div class="pin"></div>',
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            popupAnchor: [0, -36]
        });

        const marker = L.marker([lat, lng], { icon: photoIcon });

        // ポップアップの内容を作成
        const popupContent = await this.createPopupContent(photo);
        marker.bindPopup(popupContent, {
            maxWidth: 250,
            className: 'photo-popup'
        });

        // マーカーにメタデータを保存
        marker.photoData = photo;

        return marker;
    }

    // ピンの色を決定（撮影日時やカメラによって変更）
    getPinColor(photo) {
        // カメラメーカーによる色分け
        if (photo.camera && photo.camera.make) {
            const make = photo.camera.make.toLowerCase();
            if (make.includes('google') || make.includes('pixel')) {
                return 'blue';
            } else if (make.includes('apple') || make.includes('iphone')) {
                return 'green';
            } else if (make.includes('samsung')) {
                return 'purple';
            } else if (make.includes('sony')) {
                return 'orange';
            }
        }
        
        // 撮影日時による色分け（フォールバック）
        if (photo.dateTime) {
            const now = new Date();
            const diffDays = (now - photo.dateTime) / (1000 * 60 * 60 * 24);
            
            if (diffDays < 7) {
                return 'green'; // 新しい写真
            } else if (diffDays < 30) {
                return 'blue'; // 今月の写真
            } else if (diffDays < 365) {
                return 'orange'; // 今年の写真
            } else {
                return 'purple'; // 古い写真
            }
        }
        
        // デフォルトは赤
        return '';
    }

    // ポップアップの内容を作成
    async createPopupContent(photo) {
        try {
            // 写真のサムネイルを作成
            const imageUrl = await fileHandler.readFileAsDataURL(photo.file);
            const photoInfo = exifHandler.formatPhotoInfo(photo);

            let content = `
                <div class="popup-content">
                    <img src="${imageUrl}" alt="${photo.filename}" class="popup-image" onclick="photoModal.showPhoto('${photo.filename}')">
                    <div class="popup-info">
                        <strong>${photo.filename}</strong><br>
            `;

            if (photoInfo.dateTime) {
                content += `📅 ${photoInfo.dateTime}<br>`;
            }

            if (photoInfo.camera) {
                content += `📷 ${photoInfo.camera}<br>`;
            }

            if (photoInfo.settings) {
                content += `⚙️ ${photoInfo.settings}<br>`;
            }

            content += `📍 ${photoInfo.coordinates}`;

            content += `
                    </div>
                </div>
            `;

            return content;
        } catch (error) {
            console.warn('ポップアップ作成エラー:', error);
            return `
                <div class="popup-content">
                    <div class="popup-info">
                        <strong>${photo.filename}</strong><br>
                        📍 ${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}
                    </div>
                </div>
            `;
        }
    }

    // 地図の表示範囲を全ての写真に合わせて調整
    fitMapToPhotos() {
        if (this.photoData.length === 0) return;

        const group = new L.featureGroup(this.markers);
        this.map.fitBounds(group.getBounds().pad(0.1));

        // ズームレベルが高すぎる場合は調整
        if (this.map.getZoom() > 16) {
            this.map.setZoom(16);
        }
    }

    // マーカーをクリア
    clearMarkers() {
        if (this.markerCluster) {
            this.markerCluster.clearLayers();
        } else {
            this.markers.forEach(marker => this.map.removeLayer(marker));
        }
        this.markers = [];
        this.photoData = [];
    }

    // 特定の写真にフォーカス
    focusOnPhoto(filename) {
        const photo = this.photoData.find(p => p.filename === filename);
        if (photo) {
            this.map.setView([photo.latitude, photo.longitude], 16);
            
            // 対応するマーカーのポップアップを開く
            const marker = this.markers.find(m => m.photoData.filename === filename);
            if (marker) {
                marker.openPopup();
            }
        }
    }

    // 日付範囲でフィルタリング
    filterByDateRange(startDate, endDate) {
        const filteredPhotos = this.photoData.filter(photo => {
            if (!photo.dateTime) return false;
            return photo.dateTime >= startDate && photo.dateTime <= endDate;
        });
        
        this.updateMarkersVisibility(filteredPhotos);
        return filteredPhotos.length;
    }

    // カメラでフィルタリング
    filterByCamera(cameraMake, cameraModel) {
        const filteredPhotos = this.photoData.filter(photo => {
            if (!photo.camera) return false;
            const makeMatch = !cameraMake || (photo.camera.make && photo.camera.make.includes(cameraMake));
            const modelMatch = !cameraModel || (photo.camera.model && photo.camera.model.includes(cameraModel));
            return makeMatch && modelMatch;
        });
        
        this.updateMarkersVisibility(filteredPhotos);
        return filteredPhotos.length;
    }

    // フィルターをクリア
    clearFilters() {
        this.updateMarkersVisibility(this.photoData);
        return this.photoData.length;
    }

    // マーカーの表示/非表示を更新
    updateMarkersVisibility(visiblePhotos) {
        const visibleFilenames = new Set(visiblePhotos.map(p => p.filename));
        
        this.markers.forEach(marker => {
            const isVisible = visibleFilenames.has(marker.photoData.filename);
            
            if (this.markerCluster) {
                if (isVisible) {
                    if (!this.markerCluster.hasLayer(marker)) {
                        this.markerCluster.addLayer(marker);
                    }
                } else {
                    if (this.markerCluster.hasLayer(marker)) {
                        this.markerCluster.removeLayer(marker);
                    }
                }
            } else {
                if (isVisible) {
                    if (!this.map.hasLayer(marker)) {
                        marker.addTo(this.map);
                    }
                } else {
                    if (this.map.hasLayer(marker)) {
                        this.map.removeLayer(marker);
                    }
                }
            }
        });
    }

    // メッセージ表示
    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `map-message ${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#dc3545' : '#17a2b8'};
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;

        document.getElementById(this.mapElementId).appendChild(messageDiv);

        // 3秒後に自動削除
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }

    // 統計情報を取得
    getStats() {
        const stats = {
            totalPhotos: this.photoData.length,
            visibleMarkers: this.markers.filter(marker => 
                this.markerCluster ? this.markerCluster.hasLayer(marker) : this.map.hasLayer(marker)
            ).length,
            dateRange: null,
            cameras: new Set()
        };

        if (this.photoData.length > 0) {
            const dates = this.photoData
                .filter(photo => photo.dateTime)
                .map(photo => photo.dateTime)
                .sort();
            
            if (dates.length > 0) {
                stats.dateRange = {
                    start: dates[0],
                    end: dates[dates.length - 1]
                };
            }

            this.photoData.forEach(photo => {
                if (photo.camera && photo.camera.make) {
                    stats.cameras.add(`${photo.camera.make} ${photo.camera.model || ''}`.trim());
                }
            });
        }

        return stats;
    }

    // 地図をリサイズ（ウィンドウサイズ変更時など）
    resize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    // 地図を破棄
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.markers = [];
        this.photoData = [];
    }
}
// CDNフォールバック機能
class FallbackLoader {
    constructor() {
        this.loadedLibraries = new Set();
        this.failedLibraries = new Set();
    }

    // ライブラリの読み込み状況をチェック
    isLibraryLoaded(libraryName) {
        switch (libraryName) {
            case 'leaflet':
                return typeof L !== 'undefined';
            case 'exifreader':
                return typeof ExifReader !== 'undefined';
            case 'exifjs':
                return typeof EXIF !== 'undefined';
            case 'jszip':
                return typeof JSZip !== 'undefined';
            case 'markercluster':
                return typeof L !== 'undefined' && typeof L.markerClusterGroup !== 'undefined';
            default:
                return false;
        }
    }

    // CDN読み込みエラー時のフォールバック
    async loadFallback(libraryName, fallbackUrls = []) {
        if (this.isLibraryLoaded(libraryName)) {
            console.log(`✅ ${libraryName} は既に読み込まれています`);
            return true;
        }

        if (this.failedLibraries.has(libraryName)) {
            console.warn(`⚠️ ${libraryName} の読み込みは既に失敗しています`);
            return false;
        }

        console.log(`🔄 ${libraryName} のフォールバック読み込みを試行中...`);

        for (const url of fallbackUrls) {
            try {
                await this.loadScript(url);
                if (this.isLibraryLoaded(libraryName)) {
                    console.log(`✅ ${libraryName} をフォールバックから読み込み成功: ${url}`);
                    this.loadedLibraries.add(libraryName);
                    return true;
                }
            } catch (error) {
                console.warn(`❌ フォールバック失敗 (${url}):`, error);
            }
        }

        this.failedLibraries.add(libraryName);
        console.error(`❌ ${libraryName} の全ての読み込み試行が失敗しました`);
        return false;
    }

    // スクリプトの動的読み込み
    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            
            // タイムアウト設定（10秒）
            const timeout = setTimeout(() => {
                reject(new Error(`スクリプト読み込みタイムアウト: ${url}`));
            }, 10000);

            script.onload = () => {
                clearTimeout(timeout);
                resolve();
            };

            script.onerror = () => {
                clearTimeout(timeout);
                reject(new Error(`スクリプト読み込みエラー: ${url}`));
            };

            document.head.appendChild(script);
        });
    }

    // CSS の動的読み込み
    loadCSS(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`CSS読み込みエラー: ${url}`));
            document.head.appendChild(link);
        });
    }

    // 必要なライブラリのチェックと読み込み
    async ensureLibrariesLoaded() {
        const libraries = [
            {
                name: 'leaflet',
                fallbacks: [
                    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
                    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
                ]
            },
            {
                name: 'exifreader',
                fallbacks: [
                    'https://cdn.jsdelivr.net/npm/exifreader@4.16.0/dist/exif-reader.js',
                    'https://unpkg.com/exifreader@4.16.0/dist/exif-reader.js'
                ]
            },
            {
                name: 'jszip',
                fallbacks: [
                    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
                    'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
                ]
            }
        ];

        const results = [];
        for (const lib of libraries) {
            const success = await this.loadFallback(lib.name, lib.fallbacks);
            results.push({ name: lib.name, loaded: success });
        }

        return results;
    }

    // 機能縮退モードの設定
    setupDegradedMode(missingLibraries) {
        console.log('📉 機能縮退モードを設定中...');
        
        missingLibraries.forEach(lib => {
            switch (lib) {
                case 'leaflet':
                    this.disableMapFeatures();
                    break;
                case 'exifreader':
                    this.disableEXIFFeatures();
                    break;
                case 'jszip':
                    this.disableZipExport();
                    break;
            }
        });
    }

    disableMapFeatures() {
        console.warn('⚠️ 地図機能が無効になりました');
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f5f5f5; color: #666; text-align: center; padding: 20px;">
                    <div>
                        <h3>地図機能が利用できません</h3>
                        <p>Leafletライブラリの読み込みに失敗しました。<br>ネットワーク接続を確認してページを再読み込みしてください。</p>
                    </div>
                </div>
            `;
        }
    }

    disableEXIFFeatures() {
        console.warn('⚠️ EXIF読み取り機能が制限されます');
        // exif-jsのフォールバックが利用できる場合があるため、完全に無効化はしない
    }

    disableZipExport() {
        console.warn('⚠️ ZIP形式でのエクスポートが無効になりました');
        // 個別ファイルダウンロードにフォールバック
    }
}

// グローバルインスタンス
window.fallbackLoader = new FallbackLoader();

// ページ読み込み時の自動チェック
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔍 ライブラリの読み込み状況をチェック中...');
    
    // 少し待ってからチェック（CDNからの読み込み完了を待つ）
    setTimeout(async () => {
        const results = await window.fallbackLoader.ensureLibrariesLoaded();
        
        const failed = results.filter(r => !r.loaded);
        if (failed.length > 0) {
            console.warn('⚠️ 一部のライブラリが読み込めませんでした:', failed.map(f => f.name));
            window.fallbackLoader.setupDegradedMode(failed.map(f => f.name));
        } else {
            console.log('✅ 全ての必要なライブラリが読み込まれました');
        }
    }, 2000);
});

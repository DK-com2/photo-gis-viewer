// GISエクスポート機能 - 共有モジュール
class GISExporter {
    constructor() {
        this.supportedFormats = ['geojson', 'csv', 'kml'];
        this.defaultOptions = {
            includePhotos: false,
            coordinatePrecision: 6,
            includeMetadata: true
        };
    }

    // メインエクスポート機能
    async exportData(formats = ['geojson', 'csv'], options = {}) {
        try {
            const photos = exifHandler.getPhotosWithGPS();
            
            if (!photos || photos.length === 0) {
                throw new Error('エクスポートする位置情報付きの写真がありません。');
            }

            const exportOptions = { ...this.defaultOptions, ...options };
            const exportData = {};
            const timestamp = this.getTimestamp();

            // 指定された形式でデータ生成
            for (const format of formats) {
                switch (format.toLowerCase()) {
                    case 'geojson':
                        exportData.geojson = this.createGeoJSON(photos, exportOptions);
                        break;
                    case 'csv':
                        exportData.csv = this.createCSV(photos, exportOptions);
                        break;
                    case 'kml':
                        exportData.kml = this.createKML(photos, exportOptions);
                        break;
                    default:
                        console.warn(`サポートされていない形式: ${format}`);
                }
            }

            // メタデータファイル生成
            if (exportOptions.includeMetadata) {
                exportData.metadata = this.createMetadata(photos, exportOptions, timestamp);
            }

            // ダウンロード実行
            await this.downloadFiles(exportData, timestamp, exportOptions);

            console.log(`✅ GISデータエクスポート完了: ${photos.length}枚の写真`);
            return true;

        } catch (error) {
            console.error('GISエクスポートエラー:', error);
            throw error;
        }
    }

    // GeoJSON形式で出力
    createGeoJSON(photos, options) {
        const features = photos.map((photo, index) => {
            const coordinates = [
                parseFloat(photo.longitude.toFixed(options.coordinatePrecision)),
                parseFloat(photo.latitude.toFixed(options.coordinatePrecision))
            ];

            const properties = {
                id: index + 1,
                filename: photo.filename,
                photo_path: photo.path || photo.filePath,
                datetime: photo.dateTime ? photo.dateTime.toISOString() : null,
                datetime_local: photo.dateTime ? photo.dateTime.toLocaleString('ja-JP') : null
            };

            // カメラ情報
            if (photo.camera) {
                properties.camera_make = photo.camera.make || null;
                properties.camera_model = photo.camera.model || null;
                if (photo.camera.lens) {
                    properties.lens = photo.camera.lens;
                }
            }

            // 撮影設定
            if (photo.settings) {
                if (photo.settings.aperture) properties.aperture = photo.settings.aperture;
                if (photo.settings.shutterSpeed) properties.shutter_speed = photo.settings.shutterSpeed;
                if (photo.settings.iso) properties.iso = photo.settings.iso;
                if (photo.settings.focalLength) properties.focal_length = photo.settings.focalLength;
            }

            // ファイル情報
            if (photo.fileSize) {
                properties.file_size_bytes = photo.fileSize;
                properties.file_size = fileHandler.formatFileSize(photo.fileSize);
            }

            return {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: coordinates
                },
                properties: properties
            };
        });

        const geojson = {
            type: "FeatureCollection",
            crs: {
                type: "name",
                properties: {
                    name: "EPSG:4326"
                }
            },
            features: features
        };

        return JSON.stringify(geojson, null, 2);
    }

    // CSV形式で出力
    createCSV(photos, options) {
        const headers = [
            'id',
            'filename', 
            'latitude',
            'longitude',
            'datetime',
            'camera_make',
            'camera_model',
            'lens',
            'aperture',
            'shutter_speed', 
            'iso',
            'focal_length',
            'file_size',
            'photo_path'
        ];

        const rows = photos.map((photo, index) => {
            return [
                index + 1,
                `"${photo.filename}"`,
                photo.latitude.toFixed(options.coordinatePrecision),
                photo.longitude.toFixed(options.coordinatePrecision),
                photo.dateTime ? `"${photo.dateTime.toISOString()}"` : '',
                photo.camera?.make ? `"${photo.camera.make}"` : '',
                photo.camera?.model ? `"${photo.camera.model}"` : '',
                photo.camera?.lens ? `"${photo.camera.lens}"` : '',
                photo.settings?.aperture || '',
                photo.settings?.shutterSpeed || '',
                photo.settings?.iso || '',
                photo.settings?.focalLength || '',
                photo.fileSize ? fileHandler.formatFileSize(photo.fileSize) : '',
                `"${photo.path || photo.filePath}"`
            ];
        });

        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    // KML形式で出力
    createKML(photos, options) {
        const placemarks = photos.map((photo, index) => {
            const coordinates = `${photo.longitude.toFixed(options.coordinatePrecision)},${photo.latitude.toFixed(options.coordinatePrecision)},0`;
            
            let description = `<![CDATA[
                <b>ファイル名:</b> ${photo.filename}<br>
                <b>撮影日時:</b> ${photo.dateTime ? photo.dateTime.toLocaleString('ja-JP') : '不明'}<br>
            `;
            
            if (photo.camera) {
                description += `<b>カメラ:</b> ${photo.camera.make || ''} ${photo.camera.model || ''}<br>`;
            }
            
            if (photo.settings) {
                const settings = [];
                if (photo.settings.aperture) settings.push(`F${photo.settings.aperture}`);
                if (photo.settings.shutterSpeed) settings.push(`${photo.settings.shutterSpeed}s`);
                if (photo.settings.iso) settings.push(`ISO${photo.settings.iso}`);
                if (settings.length > 0) {
                    description += `<b>撮影設定:</b> ${settings.join(' | ')}<br>`;
                }
            }
            
            description += `]]>`;

            return `
        <Placemark>
            <name>${photo.filename}</name>
            <description>${description}</description>
            <Point>
                <coordinates>${coordinates}</coordinates>
            </Point>
        </Placemark>`;
        }).join('');

        return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
        <name>Photo Locations</name>
        <description>写真撮影位置データ</description>
        ${placemarks}
    </Document>
</kml>`;
    }

    // メタデータファイル生成
    createMetadata(photos, options, timestamp) {
        const stats = this.generateStats(photos);
        
        return `# Photo GIS Export Metadata
        
## Export Information
- Export Date: ${new Date().toLocaleString('ja-JP')}
- Total Photos: ${photos.length}
- Export Formats: GeoJSON, CSV${options.kml ? ', KML' : ''}
- Coordinate System: WGS84 (EPSG:4326)
- Coordinate Precision: ${options.coordinatePrecision} decimal places

## Photo Statistics
- Date Range: ${stats.dateRange.start} ～ ${stats.dateRange.end}
- Camera Types: ${stats.cameras.size} types
- File Size Range: ${stats.fileSize.min} ～ ${stats.fileSize.max}

## Camera Breakdown
${Array.from(stats.cameras).map(camera => `- ${camera}: ${stats.cameraCount[camera]}枚`).join('\n')}

## Usage Notes
- GeoJSON: Use with QGIS, ArcGIS, or web mapping applications
- CSV: Import into Excel, Google Sheets, or database systems
- Coordinate format: [longitude, latitude] in decimal degrees
- Photo paths are relative to export directory

## QGISでの写真表示方法
1. QGISで photo_locations.geojson をドラッグ&ドロップ
2. レイヤーを右クリック → 「プロパティ」
3. 「アクション」タブ → 「+」ボタン
4. アクション設定:
   - タイプ: 汎用
   - 説明: 写真表示
   - アクション: [% "photo_path" %]
5. ポイントを右クリック → 「写真表示」

## 代替手法: eVisプラグイン
1. 「プラグイン」→「プラグインの管理とインストール」
2. 「eVis」を検索してインストール
3. 「プラグイン」→「eVis」→「Event ID Tool」
4. ポイントをクリックで写真表示

## File Structure
photo_gis_export_${timestamp}/
├── photo_locations.geojson  # GIS vector data
├── photo_locations.csv      # Spreadsheet-compatible data
${options.kml ? '├── photo_locations.kml      # Google Earth compatible\n' : ''}├── export_metadata.txt      # This file
└── photos/                  # Original photos (if included)

Generated by Photo GIS Viewer
`;
    }

    // 統計情報生成
    generateStats(photos) {
        const stats = {
            cameras: new Set(),
            cameraCount: {},
            dateRange: { start: null, end: null },
            fileSize: { min: Infinity, max: 0 }
        };

        photos.forEach(photo => {
            // カメラ統計
            if (photo.camera?.make) {
                const cameraName = `${photo.camera.make} ${photo.camera.model || ''}`.trim();
                stats.cameras.add(cameraName);
                stats.cameraCount[cameraName] = (stats.cameraCount[cameraName] || 0) + 1;
            }

            // 日付統計
            if (photo.dateTime) {
                if (!stats.dateRange.start || photo.dateTime < stats.dateRange.start) {
                    stats.dateRange.start = photo.dateTime.toLocaleDateString('ja-JP');
                }
                if (!stats.dateRange.end || photo.dateTime > stats.dateRange.end) {
                    stats.dateRange.end = photo.dateTime.toLocaleDateString('ja-JP');
                }
            }

            // ファイルサイズ統計
            if (photo.fileSize) {
                if (photo.fileSize < stats.fileSize.min) {
                    stats.fileSize.min = fileHandler.formatFileSize(photo.fileSize);
                }
                if (photo.fileSize > stats.fileSize.max) {
                    stats.fileSize.max = fileHandler.formatFileSize(photo.fileSize);
                }
            }
        });

        if (stats.dateRange.start === null) {
            stats.dateRange = { start: '不明', end: '不明' };
        }

        return stats;
    }

    // ファイルダウンロード実行
    async downloadFiles(exportData, timestamp, options) {
        // まず個別ダウンロードを試行（Windowsセキュリティ回避）
        if (this.shouldUseIndividualDownload()) {
            console.log('🔒 個別ダウンロードモードを使用します');
            await this.downloadIndividualFiles(exportData, timestamp);
            return;
        }

        // ZIP生成を試行
        try {
            const zip = new JSZip();
            const folderName = `photo_gis_export_${timestamp}`;

            // データファイルをZIPに追加
            if (exportData.geojson) {
                zip.file(`${folderName}/photo_locations.geojson`, exportData.geojson);
            }
            
            if (exportData.csv) {
                zip.file(`${folderName}/photo_locations.csv`, exportData.csv);
            }
            
            if (exportData.kml) {
                zip.file(`${folderName}/photo_locations.kml`, exportData.kml);
            }
            
            if (exportData.metadata) {
                zip.file(`${folderName}/export_metadata.txt`, exportData.metadata);
            }

            // 写真ファイルを含める場合（オプション）
            if (options.includePhotos) {
                await this.addPhotosToZip(zip, folderName);
            }

            // ZIPファイル生成とダウンロード
            const zipBlob = await zip.generateAsync({ 
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 }
            });
            
            this.downloadBlob(zipBlob, `${folderName}.zip`);
            console.log('✅ ZIPファイルでダウンロード完了');
            
        } catch (error) {
            console.warn('ZIP生成エラー:', error);
            console.log('📋 個別ファイルダウンロードにフォールバック');
            
            // ZIP生成に失敗した場合は個別ダウンロード
            await this.downloadIndividualFiles(exportData, timestamp);
        }
    }

    // 個別ダウンロードを使用すべきかチェック
    shouldUseIndividualDownload() {
        const userAgent = navigator.userAgent.toLowerCase();
        
        // Windowsの場合は個別ダウンロードを推奨
        if (userAgent.includes('windows')) {
            return true;
        }
        
        // JSZipが利用できない場合
        if (typeof JSZip === 'undefined') {
            return true;
        }
        
        return false;
    }

    // 個別ファイルダウンロード
    async downloadIndividualFiles(exportData, timestamp) {
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        
        // 各ファイルを順次ダウンロード（ブラウザの制限回避）
        if (exportData.geojson) {
            this.downloadFile(`photo_locations_${timestamp}.geojson`, exportData.geojson);
            await delay(500);
        }
        
        if (exportData.csv) {
            this.downloadFile(`photo_locations_${timestamp}.csv`, exportData.csv);
            await delay(500);
        }
        
        if (exportData.kml) {
            this.downloadFile(`photo_locations_${timestamp}.kml`, exportData.kml);
            await delay(500);
        }
        
        if (exportData.metadata) {
            this.downloadFile(`export_metadata_${timestamp}.txt`, exportData.metadata);
            await delay(500);
        }
        
        console.log('📋 個別ファイルダウンロード完了');
    }

    // 写真ファイルをZIPに追加
    async addPhotosToZip(zip, folderName) {
        const photos = exifHandler.getPhotosWithGPS();
        const photosFolder = zip.folder(`${folderName}/photos`);

        for (const photo of photos) {
            try {
                const imageData = await fileHandler.readImageAsDataURL(photo.path || photo.filePath);
                const base64Data = imageData.split(',')[1]; // data:image/jpeg;base64, を除去
                photosFolder.file(photo.filename, base64Data, { base64: true });
            } catch (error) {
                console.warn(`写真追加エラー (${photo.filename}):`, error);
            }
        }
    }

    // ファイル単体ダウンロード
    downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        this.downloadBlob(blob, filename);
    }

    // Blobダウンロード
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 相対パスを安全に取得（ブラウザ制限により絶対パスは取得不可）
    getRelativePath(path) {
        try {
            return path || '';
        } catch (error) {
            console.warn('パス取得エラー:', error);
            return '';
        }
    }

    // タイムスタンプ生成
    getTimestamp() {
        const now = new Date();
        return now.toISOString().slice(0, 19).replace(/[T:]/g, '-').replace(/-/g, '').replace(/:/g, '');
    }

    // エクスポート可能かチェック
    canExport() {
        const photos = exifHandler?.getPhotosWithGPS();
        return photos && photos.length > 0;
    }

    // サポートされている形式一覧
    getSupportedFormats() {
        return [...this.supportedFormats];
    }
}

// グローバルインスタンス
let gisExporter = null;

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    gisExporter = new GISExporter();
    console.log('🗺️ GIS Exporter 初期化完了');
});

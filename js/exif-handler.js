class ExifHandler {
    constructor() {
        this.photosWithGPS = [];
        this.debugMode = true; // デバッグモードを有効化
    }

    // EXIF情報を抽出
    async extractExifData(fileObj) {
        try {
            // まずExifReaderを試行
            if (typeof ExifReader !== 'undefined') {
                return await this.extractWithExifReader(fileObj);
            }
            // ExifReaderが利用できない場合はexif-jsを使用
            else if (typeof EXIF !== 'undefined') {
                return await this.extractWithExifJS(fileObj);
            }
            else {
                throw new Error('EXIF読み取りライブラリが利用できません');
            }
        } catch (error) {
            console.warn(`EXIF読み取りエラー (${fileObj.name}):`, error);
            return {
                filename: fileObj.name,
                path: fileObj.path,
                fileSize: fileObj.size,
                lastModified: new Date(fileObj.lastModified),
                file: fileObj.file,
                hasGPS: false,
                error: error.message
            };
        }
    }

    // ExifReaderを使用したEXIF情報抽出
    async extractWithExifReader(fileObj) {
        const arrayBuffer = await fileHandler.readFileAsArrayBuffer(fileObj.file);
        const tags = ExifReader.load(arrayBuffer);
            
            // デバッグ情報を出力
            if (this.debugMode) {
                console.log(`=== ${fileObj.name} のEXIF情報 ===`);
                console.log('利用可能なタグ:', Object.keys(tags));
                console.log('GPS関連タグ:', Object.keys(tags).filter(key => key.startsWith('GPS')));
                
                // GPS情報の詳細チェック
                if (tags.GPSLatitude) {
                    console.log('GPSLatitude:', tags.GPSLatitude);
                }
                if (tags.GPSLongitude) {
                    console.log('GPSLongitude:', tags.GPSLongitude);
                }
                if (tags.GPSLatitudeRef) {
                    console.log('GPSLatitudeRef:', tags.GPSLatitudeRef);
                }
                if (tags.GPSLongitudeRef) {
                    console.log('GPSLongitudeRef:', tags.GPSLongitudeRef);
                }
            }
            
            const exifData = {
                filename: fileObj.name,
                path: fileObj.path,
                fileSize: fileObj.size,
                lastModified: new Date(fileObj.lastModified),
                file: fileObj.file,
                hasGPS: false,
                latitude: null,
                longitude: null,
                dateTime: null,
                camera: null,
                lens: null,
                settings: null,
                rawTags: this.debugMode ? tags : null // デバッグ用に生データを保存
            };

            // GPS情報の取得（複数のパターンに対応）
            let hasValidGPS = false;
            
            // パターン1: 標準的なGPSタグ
            if (tags.GPSLatitude && tags.GPSLongitude) {
                console.log('パターン1: 標準GPSタグを発見');
                const lat = this.convertGPSValue(tags.GPSLatitude, tags.GPSLatitudeRef);
                const lng = this.convertGPSValue(tags.GPSLongitude, tags.GPSLongitudeRef);
                
                if (lat !== null && lng !== null) {
                    exifData.latitude = lat;
                    exifData.longitude = lng;
                    exifData.hasGPS = true;
                    hasValidGPS = true;
                }
            }
            
            // パターン2: 別の形式のGPSタグ
            if (!hasValidGPS && (tags['GPS Latitude'] && tags['GPS Longitude'])) {
                console.log('パターン2: スペース付きGPSタグを発見');
                const lat = this.convertGPSValue(tags['GPS Latitude'], tags['GPS Latitude Ref']);
                const lng = this.convertGPSValue(tags['GPS Longitude'], tags['GPS Longitude Ref']);
                
                if (lat !== null && lng !== null) {
                    exifData.latitude = lat;
                    exifData.longitude = lng;
                    exifData.hasGPS = true;
                    hasValidGPS = true;
                }
            }

            // デバッグ出力
            if (this.debugMode) {
                console.log('GPS情報:', {
                    hasGPS: exifData.hasGPS,
                    latitude: exifData.latitude,
                    longitude: exifData.longitude
                });
            }

            // 撮影日時の取得
            exifData.dateTime = this.extractDateTime(tags);

            // カメラ情報の取得
            exifData.camera = this.extractCameraInfo(tags);

            // 撮影設定の取得
            exifData.settings = this.extractCameraSettings(tags);

            return exifData;
    }

    // exif-jsを使用したEXIF情報抽出（バックアップ）
    async extractWithExifJS(fileObj) {
        return new Promise((resolve) => {
            EXIF.getData(fileObj.file, () => {
                const exifData = {
                    filename: fileObj.name,
                    path: fileObj.path,
                    fileSize: fileObj.size,
                    lastModified: new Date(fileObj.lastModified),
                    file: fileObj.file,
                    hasGPS: false,
                    latitude: null,
                    longitude: null,
                    dateTime: null,
                    camera: null,
                    lens: null,
                    settings: null
                };

                // GPS情報の取得
                const lat = EXIF.getTag(fileObj.file, "GPSLatitude");
                const latRef = EXIF.getTag(fileObj.file, "GPSLatitudeRef");
                const lng = EXIF.getTag(fileObj.file, "GPSLongitude");
                const lngRef = EXIF.getTag(fileObj.file, "GPSLongitudeRef");

                if (lat && lng) {
                    exifData.latitude = this.convertExifJSGPS(lat, latRef);
                    exifData.longitude = this.convertExifJSGPS(lng, lngRef);
                    exifData.hasGPS = true;

                    if (this.debugMode) {
                        console.log(`exif-jsでGPS情報を検出: ${fileObj.name}`, {
                            lat: exifData.latitude,
                            lng: exifData.longitude
                        });
                    }
                }

                // 撮影日時
                const dateTime = EXIF.getTag(fileObj.file, "DateTimeOriginal") || 
                               EXIF.getTag(fileObj.file, "DateTime");
                if (dateTime) {
                    exifData.dateTime = this.parseExifDateTime(dateTime);
                }

                // カメラ情報
                const make = EXIF.getTag(fileObj.file, "Make");
                const model = EXIF.getTag(fileObj.file, "Model");
                if (make || model) {
                    exifData.camera = {
                        make: make,
                        model: model
                    };
                }

                resolve(exifData);
            });
        });
    }

    // exif-js用GPS座標変換
    convertExifJSGPS(coordinate, direction) {
        if (!coordinate || coordinate.length < 3) return null;
        
        const degrees = coordinate[0];
        const minutes = coordinate[1];
        const seconds = coordinate[2];
        
        let decimal = degrees + (minutes / 60) + (seconds / 3600);
        
        if (direction === 'S' || direction === 'W') {
            decimal = -decimal;
        }
        
        return decimal;
    }

    // EXIF日時文字列をDateオブジェクトに変換
    parseExifDateTime(dateTimeStr) {
        try {
            // "2023:12:25 14:30:15" 形式
            const [datePart, timePart] = dateTimeStr.split(' ');
            const [year, month, day] = datePart.split(':');
            const [hour, minute, second] = timePart ? timePart.split(':') : ['0', '0', '0'];
            
            return new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second)
            );
        } catch (error) {
            console.warn('日時変換エラー:', error);
            return null;
        }
    }

    // GPS値を変換（複数形式に対応）
    convertGPSValue(gpsTag, refTag) {
        if (!gpsTag) return null;

        try {
            let value = null;
            let direction = 'N'; // デフォルト

            // 参照方向の取得
            if (refTag) {
                if (refTag.value) {
                    direction = Array.isArray(refTag.value) ? refTag.value[0] : refTag.value;
                } else if (refTag.description) {
                    direction = refTag.description.charAt(0); // "North latitude" -> "N"
                }
            }

            // ExifReaderの場合、descriptionに十進度が既に含まれている
            if (gpsTag.description && typeof gpsTag.description === 'number') {
                value = gpsTag.description;
                // 既に十進度なので、方向による符号調整のみ
                if (direction === 'S' || direction === 'W') {
                    value = -value;
                }
            }
            // 数値配列形式の場合 [度, 分, 秒]
            else if (gpsTag.value && Array.isArray(gpsTag.value) && gpsTag.value.length >= 2) {
                const degrees = gpsTag.value[0];
                const minutes = gpsTag.value[1] || 0;
                const seconds = gpsTag.value[2] || 0;
                
                value = degrees + (minutes / 60) + (seconds / 3600);
                
                // 南緯・西経の場合は負の値
                if (direction === 'S' || direction === 'W') {
                    value = -value;
                }
            }
            // 文字列形式の場合（fallback）
            else if (gpsTag.description && typeof gpsTag.description === 'string') {
                value = this.convertDMSToDD(gpsTag.description, direction);
            }
            // 単一数値の場合
            else if (typeof gpsTag.value === 'number') {
                value = gpsTag.value;
                if (direction === 'S' || direction === 'W') {
                    value = -value;
                }
            }

            if (this.debugMode) {
                console.log('GPS変換:', {
                    original: gpsTag,
                    direction: direction,
                    converted: value
                });
            }

            return value;
        } catch (error) {
            console.warn('GPS値変換エラー:', error);
            return null;
        }
    }

    // DMS (度分秒) を DD (十進度) に変換
    convertDMSToDD(dmsString, direction) {
        try {
            // "35° 39' 29.07"" のような形式をパース
            const parts = dmsString.match(/(\d+(?:\.\d+)?)°?\s*(\d+(?:\.\d+)?)'?\s*([\d.]+)"?/);
            if (!parts) {
                // 既に十進度の場合
                const decimal = parseFloat(dmsString);
                return (direction === 'S' || direction === 'W') ? -decimal : decimal;
            }

            const degrees = parseFloat(parts[1]);
            const minutes = parseFloat(parts[2]);
            const seconds = parseFloat(parts[3]);

            let decimal = degrees + (minutes / 60) + (seconds / 3600);
            
            // 南緯・西経の場合は負の値
            if (direction === 'S' || direction === 'W') {
                decimal = -decimal;
            }

            return decimal;
        } catch (error) {
            console.warn('GPS座標変換エラー:', error);
            return null;
        }
    }

    // 撮影日時の抽出
    extractDateTime(tags) {
        const dateTimeFields = [
            'DateTimeOriginal',
            'DateTime',
            'DateTimeDigitized',
            'Date Time Original',
            'Date Time',
            'Date Time Digitized'
        ];

        for (const field of dateTimeFields) {
            if (tags[field] && tags[field].description) {
                try {
                    // "2023:12:25 14:30:15" 形式を JavaScript Date に変換
                    const dateTimeStr = tags[field].description;
                    const [datePart, timePart] = dateTimeStr.split(' ');
                    const [year, month, day] = datePart.split(':');
                    const [hour, minute, second] = timePart ? timePart.split(':') : ['0', '0', '0'];
                    
                    return new Date(
                        parseInt(year),
                        parseInt(month) - 1, // 月は0から始まる
                        parseInt(day),
                        parseInt(hour),
                        parseInt(minute),
                        parseInt(second)
                    );
                } catch (error) {
                    console.warn('日時変換エラー:', error);
                }
            }
        }
        return null;
    }

    // カメラ情報の抽出
    extractCameraInfo(tags) {
        const camera = {};
        
        const makeFields = ['Make', 'Camera Make'];
        const modelFields = ['Model', 'Camera Model'];
        const lensFields = ['LensModel', 'Lens Model'];
        
        for (const field of makeFields) {
            if (tags[field] && tags[field].description) {
                camera.make = tags[field].description;
                break;
            }
        }
        
        for (const field of modelFields) {
            if (tags[field] && tags[field].description) {
                camera.model = tags[field].description;
                break;
            }
        }
        
        for (const field of lensFields) {
            if (tags[field] && tags[field].description) {
                camera.lens = tags[field].description;
                break;
            }
        }

        return Object.keys(camera).length > 0 ? camera : null;
    }

    // 撮影設定の抽出
    extractCameraSettings(tags) {
        const settings = {};

        const apertureFields = ['FNumber', 'F Number', 'Aperture'];
        const shutterFields = ['ExposureTime', 'Exposure Time', 'Shutter Speed'];
        const isoFields = ['ISOSpeedRatings', 'ISO Speed Ratings', 'ISO'];
        const focalFields = ['FocalLength', 'Focal Length'];

        for (const field of apertureFields) {
            if (tags[field] && tags[field].description) {
                settings.aperture = tags[field].description;
                break;
            }
        }

        for (const field of shutterFields) {
            if (tags[field] && tags[field].description) {
                settings.shutterSpeed = tags[field].description;
                break;
            }
        }

        for (const field of isoFields) {
            if (tags[field] && tags[field].description) {
                settings.iso = tags[field].description;
                break;
            }
        }

        for (const field of focalFields) {
            if (tags[field] && tags[field].description) {
                settings.focalLength = tags[field].description;
                break;
            }
        }

        return Object.keys(settings).length > 0 ? settings : null;
    }

    // 複数ファイルのEXIF情報を処理
    async processFiles(fileObjects, progressCallback) {
        this.photosWithGPS = [];
        const allPhotos = [];
        const total = fileObjects.length;

        console.log(`${total}枚の写真を処理開始...`);

        for (let i = 0; i < fileObjects.length; i++) {
            const fileObj = fileObjects[i];
            
            if (progressCallback) {
                progressCallback(i + 1, total, fileObj.name);
            }

            console.log(`処理中: ${fileObj.name} (${i + 1}/${total})`);
            const exifData = await this.extractExifData(fileObj);
            allPhotos.push(exifData);

            if (exifData.hasGPS) {
                this.photosWithGPS.push(exifData);
                console.log(`✓ GPS情報発見: ${fileObj.name}`);
            } else {
                console.log(`✗ GPS情報なし: ${fileObj.name}`);
            }

            // UIの応答性を保つために少し待機
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        }

        console.log(`処理完了: 全${total}枚中${this.photosWithGPS.length}枚にGPS情報あり`);

        return {
            allPhotos,
            photosWithGPS: this.photosWithGPS,
            totalCount: total,
            gpsCount: this.photosWithGPS.length
        };
    }

    // デバッグモードの切り替え
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    // GPS情報のある写真一覧を取得
    getPhotosWithGPS() {
        return this.photosWithGPS;
    }

    // 日時でフィルタリング
    filterByDateRange(startDate, endDate) {
        return this.photosWithGPS.filter(photo => {
            if (!photo.dateTime) return false;
            return photo.dateTime >= startDate && photo.dateTime <= endDate;
        });
    }

    // カメラでフィルタリング
    filterByCamera(cameraMake, cameraModel) {
        return this.photosWithGPS.filter(photo => {
            if (!photo.camera) return false;
            const makeMatch = !cameraMake || (photo.camera.make && photo.camera.make.includes(cameraMake));
            const modelMatch = !cameraModel || (photo.camera.model && photo.camera.model.includes(cameraModel));
            return makeMatch && modelMatch;
        });
    }

    // 写真情報をフォーマット
    formatPhotoInfo(photo) {
        const info = {
            filename: photo.filename,
            path: photo.path,
            fileSize: fileHandler.formatFileSize(photo.fileSize),
            coordinates: photo.hasGPS ? `${photo.latitude.toFixed(6)}, ${photo.longitude.toFixed(6)}` : '位置情報なし'
        };

        if (photo.dateTime) {
            info.dateTime = photo.dateTime.toLocaleString('ja-JP');
        }

        if (photo.camera) {
            info.camera = `${photo.camera.make || ''} ${photo.camera.model || ''}`.trim();
            if (photo.camera.lens) {
                info.lens = photo.camera.lens;
            }
        }

        if (photo.settings) {
            const settings = [];
            if (photo.settings.aperture) settings.push(`F${photo.settings.aperture}`);
            if (photo.settings.shutterSpeed) settings.push(`${photo.settings.shutterSpeed}s`);
            if (photo.settings.iso) settings.push(`ISO${photo.settings.iso}`);
            if (photo.settings.focalLength) settings.push(`${photo.settings.focalLength}mm`);
            
            if (settings.length > 0) {
                info.settings = settings.join(' | ');
            }
        }

        return info;
    }
}
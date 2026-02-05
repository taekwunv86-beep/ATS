// =====================================================
// Storage Module
// Supabase Storage 파일 업로드/다운로드 관리
// =====================================================

const Storage = {
    BUCKET_NAME: 'attachments',

    // =====================================================
    // 파일 업로드
    // =====================================================

    // 단일 파일 업로드
    // visibility: 'all' (모든 사용자) 또는 'admin_only' (관리자/슈퍼관리자만)
    // maskSalary: true이면 PDF의 연봉 정보를 마스킹
    async uploadFile(applicantId, file, visibility = 'all', maskSalary = false) {
        try {
            // 권한 체크: 관리자/슈퍼관리자만 업로드 가능
            if (!Auth.isAdminOrAbove()) {
                throw new Error('파일 업로드 권한이 없습니다. 관리자만 업로드할 수 있습니다.');
            }

            let fileToUpload = file;
            let wasMasked = false;
            let maskedCount = 0;

            // PDF 파일이고 마스킹 옵션이 활성화된 경우
            if (maskSalary && window.PdfMasking && PdfMasking.isPdf(file)) {
                try {
                    console.log('PDF 연봉 정보 마스킹 처리 중...');
                    const maskResult = await PdfMasking.maskSalaryInfo(file);
                    fileToUpload = maskResult.file;
                    wasMasked = maskResult.masked;
                    maskedCount = maskResult.maskedCount;

                    if (wasMasked) {
                        console.log(`연봉 정보 ${maskedCount}개 마스킹 완료`);
                    }
                } catch (maskError) {
                    console.error('PDF 마스킹 오류 (원본 파일로 계속):', maskError);
                    // 마스킹 실패 시 원본 파일로 업로드 진행
                }
            }

            // 파일 경로 생성 (applicantId/timestamp_randomId.ext)
            // Supabase Storage는 한글 경로를 지원하지 않으므로 영문으로 변환
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 8);
            const ext = file.name.split('.').pop().toLowerCase();
            const filePath = `${applicantId}/${timestamp}_${randomId}.${ext}`;

            // Supabase Storage에 업로드
            const { data, error } = await supabaseClient.storage
                .from(this.BUCKET_NAME)
                .upload(filePath, fileToUpload, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) {
                console.error('Storage 업로드 에러 상세:', error.message, error.statusCode, error);
                throw error;
            }

            // 파일 메타데이터 생성
            const fileSize = this.formatFileSize(fileToUpload.size);
            const fileType = this.getFileType(file.name, file.type);

            // 첨부파일 메타데이터 DB에 저장 (visibility 포함)
            const attachmentResult = await DB.createAttachment({
                applicant_id: applicantId,
                file_name: file.name,
                file_type: fileType,
                file_size: fileSize,
                storage_path: data.path,
                visibility: visibility
            });

            if (!attachmentResult.success) {
                // 메타데이터 저장 실패 시 업로드된 파일 삭제
                await this.deleteFile(data.path);
                throw new Error(attachmentResult.error);
            }

            return {
                success: true,
                data: attachmentResult.data,
                wasMasked: wasMasked,
                maskedCount: maskedCount
            };
        } catch (err) {
            console.error('파일 업로드 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 여러 파일 업로드
    // visibility: 'all' (모든 사용자) 또는 'admin_only' (관리자/슈퍼관리자만)
    // maskSalary: true이면 PDF의 연봉 정보를 마스킹
    async uploadFiles(applicantId, files, visibility = 'all', maskSalary = false) {
        const results = {
            success: [],
            failed: [],
            maskedFiles: []
        };

        for (const file of files) {
            const result = await this.uploadFile(applicantId, file, visibility, maskSalary);
            if (result.success) {
                results.success.push(result.data);
                if (result.wasMasked) {
                    results.maskedFiles.push({
                        fileName: file.name,
                        maskedCount: result.maskedCount
                    });
                }
            } else {
                results.failed.push({
                    fileName: file.name,
                    error: result.error
                });
            }
        }

        return {
            successCount: results.success.length,
            failedCount: results.failed.length,
            success: results.success,
            failed: results.failed,
            maskedFiles: results.maskedFiles
        };
    },

    // =====================================================
    // 파일 다운로드
    // =====================================================

    // 파일 다운로드 URL 가져오기 (1시간 유효)
    async getFileUrl(storagePath, expiresIn = 3600) {
        try {
            const { data, error } = await supabaseClient.storage
                .from(this.BUCKET_NAME)
                .createSignedUrl(storagePath, expiresIn);

            if (error) throw error;
            return { success: true, url: data.signedUrl };
        } catch (err) {
            console.error('파일 URL 생성 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 파일 다운로드
    async downloadFile(storagePath, fileName) {
        try {
            const { data, error } = await supabaseClient.storage
                .from(this.BUCKET_NAME)
                .download(storagePath);

            if (error) throw error;

            // Blob을 다운로드 링크로 변환
            const url = URL.createObjectURL(data);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return { success: true };
        } catch (err) {
            console.error('파일 다운로드 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // PDF 파일 브라우저에서 보기 (새 탭)
    async viewPdfInBrowser(storagePath) {
        try {
            // 1시간 유효한 서명된 URL 생성
            const { data, error } = await supabaseClient.storage
                .from(this.BUCKET_NAME)
                .createSignedUrl(storagePath, 3600);

            if (error) throw error;

            // 새 탭에서 PDF 열기
            window.open(data.signedUrl, '_blank');

            return { success: true };
        } catch (err) {
            console.error('PDF 보기 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 파일이 PDF인지 확인
    isPdf(fileName) {
        return fileName?.toLowerCase().endsWith('.pdf');
    },

    // 여러 파일 ZIP으로 다운로드
    async downloadFilesAsZip(attachments, zipFileName = 'attachments.zip') {
        try {
            if (!window.JSZip) {
                throw new Error('JSZip 라이브러리가 로드되지 않았습니다.');
            }

            const zip = new JSZip();
            const folder = zip.folder('첨부파일');

            for (const attachment of attachments) {
                try {
                    const { data, error } = await supabaseClient.storage
                        .from(this.BUCKET_NAME)
                        .download(attachment.storage_path);

                    if (error) {
                        console.error(`파일 다운로드 실패: ${attachment.file_name}`, error);
                        continue;
                    }

                    folder.file(attachment.file_name, data);
                } catch (err) {
                    console.error(`파일 처리 실패: ${attachment.file_name}`, err);
                }
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            link.download = zipFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return { success: true };
        } catch (err) {
            console.error('ZIP 다운로드 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // =====================================================
    // 파일 삭제
    // =====================================================

    // 파일 삭제 (스토리지 + 메타데이터)
    async deleteFile(storagePath) {
        try {
            const { error } = await supabaseClient.storage
                .from(this.BUCKET_NAME)
                .remove([storagePath]);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('파일 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 첨부파일 삭제 (메타데이터 + 스토리지)
    async deleteAttachment(attachment) {
        try {
            // 스토리지에서 파일 삭제
            await this.deleteFile(attachment.storage_path);

            // 메타데이터 삭제
            await DB.deleteAttachment(attachment.id);

            return { success: true };
        } catch (err) {
            console.error('첨부파일 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // 지원자의 모든 첨부파일 삭제
    async deleteAllAttachments(applicantId) {
        try {
            // 첨부파일 목록 조회
            const { data: attachments } = await DB.getAttachments(applicantId);
            if (!attachments || attachments.length === 0) {
                return { success: true };
            }

            // 스토리지에서 파일들 삭제
            const paths = attachments.map(a => a.storage_path);
            const { error } = await supabaseClient.storage
                .from(this.BUCKET_NAME)
                .remove(paths);

            if (error) {
                console.error('스토리지 파일 삭제 실패:', error);
            }

            // 메타데이터는 지원자 삭제 시 CASCADE로 자동 삭제됨
            return { success: true };
        } catch (err) {
            console.error('첨부파일 일괄 삭제 실패:', err);
            return { success: false, error: err.message };
        }
    },

    // =====================================================
    // 유틸리티 함수
    // =====================================================

    // 파일 크기 포맷팅
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    },

    // 파일 타입 결정
    getFileType(fileName, mimeType) {
        const ext = fileName.split('.').pop().toLowerCase();

        if (ext === 'pdf' || mimeType === 'application/pdf') {
            return 'pdf';
        }
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || mimeType?.startsWith('image/')) {
            return 'image';
        }
        if (['doc', 'docx'].includes(ext) || mimeType?.includes('word')) {
            return 'word';
        }
        if (['xls', 'xlsx'].includes(ext) || mimeType?.includes('excel') || mimeType?.includes('spreadsheet')) {
            return 'excel';
        }
        if (ext === 'hwp') {
            return 'hwp';
        }
        return 'document';
    },

    // 파일 타입에 따른 아이콘 클래스
    getFileIcon(fileType) {
        const icons = {
            pdf: 'fa-file-pdf text-red-500',
            image: 'fa-file-image text-green-500',
            word: 'fa-file-word text-blue-500',
            excel: 'fa-file-excel text-green-600',
            hwp: 'fa-file-alt text-blue-400',
            document: 'fa-file-alt text-gray-500'
        };
        return icons[fileType] || icons.document;
    },

    // 허용된 파일 타입 확인
    isAllowedFileType(file) {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/x-hwp',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];

        const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'hwp', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
        const ext = file.name.split('.').pop().toLowerCase();

        return allowedTypes.includes(file.type) || allowedExtensions.includes(ext);
    },

    // 파일 크기 제한 확인 (기본 10MB)
    isFileSizeAllowed(file, maxSizeMB = 10) {
        return file.size <= maxSizeMB * 1024 * 1024;
    }
};

// Export
window.Storage = Storage;

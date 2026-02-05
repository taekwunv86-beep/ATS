// =====================================================
// PDF Masking Module
// PDF 파일에서 연봉 정보를 탐지하고 마스킹 처리
// =====================================================

const PdfMasking = {
    // 연봉 관련 패턴 정규식
    SALARY_PATTERNS: [
        // 한글 패턴
        /(?:연봉|년봉|희망\s*연봉|현재\s*연봉|예상\s*연봉|희망\s*급여|현재\s*급여|급여|월급|월봉)[\s:：\-~]*[\d,\.]+\s*(?:만원|만|원|천만원|천만)?/gi,
        // 숫자 + 단위 패턴 (연봉 근처)
        /[\d,]+\s*(?:만원|천만원)/gi,
        // 영문 패턴
        /(?:salary|annual\s*salary|expected\s*salary|current\s*salary|pay)[\s:：\-~]*[\d,\.]+/gi,
    ],

    // 연봉 키워드 (근처에 숫자가 있으면 마스킹)
    SALARY_KEYWORDS: [
        '연봉', '년봉', '급여', '월급', '월봉',
        '희망연봉', '현재연봉', '예상연봉', '희망급여', '현재급여',
        '희망 연봉', '현재 연봉', '예상 연봉', '희망 급여', '현재 급여',
        'salary', 'pay', 'annual salary', 'expected salary'
    ],

    /**
     * PDF 파일에서 연봉 정보를 마스킹
     * @param {File} file - PDF 파일
     * @returns {Promise<{file: File, masked: boolean, maskedCount: number}>}
     */
    async maskSalaryInfo(file) {
        try {
            console.log('[PDF 마스킹] 시작 - 파일:', file.name);

            // PDF.js와 pdf-lib 라이브러리 확인
            console.log('[PDF 마스킹] pdfjsLib 존재:', !!window.pdfjsLib);
            console.log('[PDF 마스킹] PDFLib 존재:', !!window.PDFLib);

            if (!window.pdfjsLib) {
                throw new Error('PDF.js 라이브러리가 로드되지 않았습니다.');
            }
            if (!window.PDFLib) {
                throw new Error('pdf-lib 라이브러리가 로드되지 않았습니다.');
            }

            // 파일을 ArrayBuffer로 변환
            const originalArrayBuffer = await file.arrayBuffer();
            console.log('[PDF 마스킹] ArrayBuffer 크기:', originalArrayBuffer.byteLength);

            // ArrayBuffer 복사 (pdf.js와 pdf-lib에서 각각 사용하기 위해)
            const arrayBufferForPdfJs = originalArrayBuffer.slice(0);
            const arrayBufferForPdfLib = originalArrayBuffer.slice(0);

            // 1. PDF.js로 텍스트 및 위치 정보 추출
            console.log('[PDF 마스킹] 텍스트 추출 시작...');
            const textItems = await this.extractTextWithPositions(arrayBufferForPdfJs);
            console.log('[PDF 마스킹] 추출된 텍스트 항목 수:', textItems.length);

            // 추출된 텍스트 샘플 출력 (처음 20개)
            if (textItems.length > 0) {
                console.log('[PDF 마스킹] 텍스트 샘플:', textItems.slice(0, 20).map(t => t.text));
            }

            // 2. 연봉 관련 텍스트 찾기
            const itemsToMask = this.findSalaryItems(textItems);
            console.log('[PDF 마스킹] 마스킹 대상:', itemsToMask.length, '개');

            if (itemsToMask.length === 0) {
                console.log('[PDF 마스킹] 마스킹할 연봉 정보가 없습니다.');
                return { file, masked: false, maskedCount: 0 };
            }

            console.log('[PDF 마스킹] 마스킹할 항목:', itemsToMask.map(i => ({ text: i.text, reason: i.reason })));

            // 3. pdf-lib로 마스킹 처리 (별도 복사본 사용)
            const maskedPdfBytes = await this.applyMasking(arrayBufferForPdfLib, itemsToMask);

            // 4. 새 File 객체 생성
            const maskedFile = new File(
                [maskedPdfBytes],
                file.name,
                { type: 'application/pdf' }
            );

            return {
                file: maskedFile,
                masked: true,
                maskedCount: itemsToMask.length
            };

        } catch (error) {
            console.error('PDF 마스킹 오류:', error);
            throw error;
        }
    },

    /**
     * PDF에서 텍스트와 위치 정보 추출
     */
    async extractTextWithPositions(arrayBuffer) {
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const allItems = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const viewport = page.getViewport({ scale: 1.0 });

            for (const item of textContent.items) {
                if (item.str && item.str.trim()) {
                    // 텍스트 위치 계산
                    const tx = item.transform;
                    allItems.push({
                        text: item.str,
                        page: pageNum,
                        x: tx[4],
                        y: viewport.height - tx[5], // PDF 좌표계 변환
                        width: item.width,
                        height: item.height || 12,
                        transform: tx
                    });
                }
            }
        }

        return allItems;
    },

    /**
     * 연봉 관련 텍스트 항목 찾기
     */
    findSalaryItems(textItems) {
        const itemsToMask = [];
        const processedIndices = new Set();

        // 전체 텍스트 구성 (연속된 항목 연결)
        for (let i = 0; i < textItems.length; i++) {
            if (processedIndices.has(i)) continue;

            const item = textItems[i];
            const text = item.text;

            // 1. 직접 패턴 매칭
            for (const pattern of this.SALARY_PATTERNS) {
                pattern.lastIndex = 0;
                if (pattern.test(text)) {
                    itemsToMask.push({
                        ...item,
                        reason: 'pattern_match'
                    });
                    processedIndices.add(i);
                    break;
                }
            }

            // 2. 키워드 + 근처 숫자 탐지 (표 형태 지원)
            if (!processedIndices.has(i)) {
                const hasKeyword = this.SALARY_KEYWORDS.some(kw =>
                    text.toLowerCase().includes(kw.toLowerCase())
                );

                if (hasKeyword) {
                    // 현재 항목 마스킹
                    itemsToMask.push({
                        ...item,
                        reason: 'keyword_match'
                    });
                    processedIndices.add(i);

                    // 같은 페이지, 같은 줄(y 좌표 유사)의 모든 항목 검색
                    // 표 형태에서 열이 떨어져 있어도 찾을 수 있도록 전체 검색
                    for (let j = 0; j < textItems.length; j++) {
                        if (processedIndices.has(j) || j === i) continue;

                        const nearItem = textItems[j];

                        // 같은 페이지가 아니면 스킵
                        if (nearItem.page !== item.page) continue;

                        // y 좌표가 비슷한 경우 (같은 줄) - 허용 오차 20px
                        const isSameRow = Math.abs(nearItem.y - item.y) < 20;

                        // 숫자가 포함되어 있고 금액 관련 패턴인 경우
                        const hasNumber = /[\d,]+/.test(nearItem.text);
                        const hasMoneyUnit = /만원|천만|원|만/.test(nearItem.text);
                        const isLikelyAmount = /^[\d,\.]+\s*(?:만원|천만원|만|원)?$/.test(nearItem.text.trim());

                        if (isSameRow && hasNumber && (hasMoneyUnit || isLikelyAmount)) {
                            itemsToMask.push({
                                ...nearItem,
                                reason: 'nearby_number'
                            });
                            processedIndices.add(j);
                        }
                    }
                }
            }
        }

        return itemsToMask;
    },

    /**
     * pdf-lib로 마스킹 적용
     */
    async applyMasking(arrayBuffer, itemsToMask) {
        const { PDFDocument, rgb } = PDFLib;

        // PDF 로드
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pages = pdfDoc.getPages();

        // 페이지별로 그룹화
        const itemsByPage = {};
        for (const item of itemsToMask) {
            if (!itemsByPage[item.page]) {
                itemsByPage[item.page] = [];
            }
            itemsByPage[item.page].push(item);
        }

        // 각 페이지에 마스킹 적용
        for (const [pageNum, items] of Object.entries(itemsByPage)) {
            const page = pages[parseInt(pageNum) - 1];
            if (!page) continue;

            const { height } = page.getSize();

            for (const item of items) {
                // PDF 좌표계로 변환 (pdf.js와 pdf-lib의 좌표계 차이 보정)
                const pdfY = height - item.y - item.height;

                // 마스킹 영역 계산 (여유 공간 추가)
                const maskWidth = Math.max(item.width + 4, 30);
                const maskHeight = Math.max(item.height + 4, 14);
                const maskX = item.x - 2;
                const maskY = pdfY - 2;

                // 1. 흰색 박스 그리기
                page.drawRectangle({
                    x: maskX,
                    y: maskY,
                    width: maskWidth,
                    height: maskHeight,
                    color: rgb(1, 1, 1), // 흰색
                    borderColor: rgb(0.9, 0.9, 0.9),
                    borderWidth: 0.5,
                });

                // 2. "***" 텍스트 그리기
                try {
                    const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                    page.drawText('***', {
                        x: maskX + 4,
                        y: maskY + 3,
                        size: Math.min(item.height || 10, 12),
                        font: font,
                        color: rgb(0.5, 0.5, 0.5), // 회색
                    });
                } catch (fontError) {
                    console.warn('폰트 임베딩 오류, 텍스트 생략:', fontError);
                }
            }
        }

        // 수정된 PDF 저장
        return await pdfDoc.save();
    },

    /**
     * PDF 파일인지 확인
     */
    isPdf(file) {
        return file.name.toLowerCase().endsWith('.pdf') ||
               file.type === 'application/pdf';
    },

    /**
     * 연봉 정보 포함 여부 미리보기 (마스킹 없이 확인만)
     */
    async checkSalaryInfo(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const textItems = await this.extractTextWithPositions(arrayBuffer);
            const itemsToMask = this.findSalaryItems(textItems);

            return {
                hasSalaryInfo: itemsToMask.length > 0,
                count: itemsToMask.length,
                items: itemsToMask.map(item => ({
                    text: item.text,
                    page: item.page,
                    reason: item.reason
                }))
            };
        } catch (error) {
            console.error('연봉 정보 확인 오류:', error);
            return { hasSalaryInfo: false, count: 0, items: [], error: error.message };
        }
    }
};

// Export
window.PdfMasking = PdfMasking;

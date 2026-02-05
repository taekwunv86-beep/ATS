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
    SALARY_KEYWORDS: ['연봉', '년봉', '급여', '월급', '월봉', 'salary', 'pay'],

    /**
     * PDF 파일에서 연봉 정보를 마스킹
     * @param {File} file - PDF 파일
     * @returns {Promise<{file: File, masked: boolean, maskedCount: number}>}
     */
    async maskSalaryInfo(file) {
        try {
            // PDF.js와 pdf-lib 라이브러리 확인
            if (!window.pdfjsLib) {
                throw new Error('PDF.js 라이브러리가 로드되지 않았습니다.');
            }
            if (!window.PDFLib) {
                throw new Error('pdf-lib 라이브러리가 로드되지 않았습니다.');
            }

            // 파일을 ArrayBuffer로 변환
            const arrayBuffer = await file.arrayBuffer();

            // 1. PDF.js로 텍스트 및 위치 정보 추출
            const textItems = await this.extractTextWithPositions(arrayBuffer);

            // 2. 연봉 관련 텍스트 찾기
            const itemsToMask = this.findSalaryItems(textItems);

            if (itemsToMask.length === 0) {
                console.log('마스킹할 연봉 정보가 없습니다.');
                return { file, masked: false, maskedCount: 0 };
            }

            console.log(`마스킹할 항목 ${itemsToMask.length}개 발견:`, itemsToMask);

            // 3. pdf-lib로 마스킹 처리
            const maskedPdfBytes = await this.applyMasking(arrayBuffer, itemsToMask);

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

            // 2. 키워드 + 근처 숫자 탐지
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

                    // 근처 항목들 중 숫자가 포함된 것 찾기 (같은 페이지, y 좌표 유사)
                    for (let j = i + 1; j < Math.min(i + 5, textItems.length); j++) {
                        if (processedIndices.has(j)) continue;

                        const nearItem = textItems[j];
                        if (nearItem.page !== item.page) break;

                        // y 좌표가 비슷하고 (같은 줄) 숫자가 포함된 경우
                        if (Math.abs(nearItem.y - item.y) < 15 && /[\d,]+/.test(nearItem.text)) {
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

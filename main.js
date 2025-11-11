// main.js

import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

// --- DOM 요소 가져오기 ---
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");

let handLandmarker;
let lastVideoTime = -1;
let results = null;


// ... (import 및 DOM 요소들 아래)

// --- 오브젝트 상태 변수 ---
// ...
let objectPos = { x: 320, y: 240 }; 
let objectRadius = 30; // 현재 원의 반지름 (계속 변할 변수)
const DEFAULT_RADIUS = 30; // 핀치를 안했을 때 돌아갈 기본 크기 (상수)
let isDragging = false;

// --- ⬇️ 새로 추가 (핀치 놓침 허용 오차) ---
let pinchReleaseCounter = 0; // 핀치를 놓친 프레임 수를 카운트
const PINCH_RELEASE_TOLERANCE = 5; // 5프레임(약 0.08초)까지는 봐줌 (이 값을 조절해 민감도 튜닝)
// --- (여기까지 추가) ---


// --- 1. Hand Landmarker 초기화 ---
async function setupMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        // ... (HandLandmarker.createFromOptions 내부)
    baseOptions: {
        // 'latest' 대신 'float16/1'이라는 특정 버전 경로를 사용합니다.
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, // ✅
        delegate: "GPU"
    },
// ...
        runningMode: "VIDEO", // 비디오 스트림용
        numHands: 1 // 우선 손 1개만 인식
    });
    console.log("HandLandmarker 준비 완료");

    // --- 2. 웹캠 실행 ---
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", () => {
                // 비디오가 로드되면 메인 루프 시작
                requestAnimationFrame(predictWebcam);
            });
        })
        .catch(err => console.error("웹캠 접근 오류:", err));
}

// --- 3. 메인 루프 (매 프레임 실행) ---
// --- 3. 메인 루프 (매 프레임 실행) ---
function predictWebcam() {
    // 캔버스 크기를 비디오에 맞춤
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    
    const videoTime = video.currentTime;
    
    // 1. AI 감지는 비디오 프레임이 새로 업데이트될 때만 실행 (성능 최적화)
    if (videoTime !== lastVideoTime && handLandmarker) {
        lastVideoTime = videoTime;
        // MediaPipe에 손 인식 요청 (결과를 밖의 'results' 변수에 저장)
        results = handLandmarker.detectForVideo(video, performance.now());
    }

    // --- 4. 캔버스 그리기는 매 프레임(1/60초)마다 무조건 실행 ---
    // (이것이 깜빡임을 막습니다. 텅 빈 프레임이 생기지 않습니다.)
    
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 4-1. 웹캠 영상 그리기 (좌우 반전)
    canvasCtx.save();
    canvasCtx.scale(-1, 1); // 좌우 반전
    canvasCtx.translate(-canvasElement.width, 0);
    // 비디오의 현재 프레임(새롭든 아니든)을 그림
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();

    // 4-2. 오브젝트 로직 처리 및 그리기
    // 이전에 감지된 'results'가 있다면, 그걸 기반으로 그림
    if (results) {
        handleObjectInteraction(results);
    }

    // 다음 프레임 요청
    requestAnimationFrame(predictWebcam);
}



// (E) --- 5. 핵심 로직: 상호작용 처리 함수 ---
// (이 함수 전체를 아래 코드로 교체하세요)
// (E) --- 5. 핵심 로직: 상호작용 처리 함수 ---
// (이 함수 전체를 복사해서 교체하세요)
function handleObjectInteraction(results) {
    
    // 1. [제스처 계산]
    let isPinching = false;
    let pinchMidPoint = null;
    let handSizeInPixels = 0;
    let isHandDetected = (results.landmarks && results.landmarks.length > 0);
    
    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    if (isHandDetected) {
        // 손이 감지되면
        const landmarks = results.landmarks[0]; 
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // 헬퍼 함수를 사용하여 좌표 변환
        const thumbPos = getPixelPos(thumbTip, canvasWidth, canvasHeight);
        const indexPos = getPixelPos(indexTip, canvasWidth, canvasHeight);

        // 핀치 거리 계산
        const distance = Math.hypot(thumbPos.x - indexPos.x, thumbPos.y - indexPos.y);
        const pinchThreshold = 40;

        if (distance < pinchThreshold) {
            // [핀치 중일 때]
            isPinching = true;
            pinchMidPoint = { 
                x: (thumbPos.x + indexPos.x) / 2, 
                y: (thumbPos.y + indexPos.y) / 2 
            };
            
            // 손 크기 계산 (크기 조절에 사용)
            const wrist = landmarks[0];
            const middleMcp = landmarks[9];

            const wristPos = getPixelPos(wrist, canvasWidth, canvasHeight);
            const middleMcpPos = getPixelPos(middleMcp, canvasWidth, canvasHeight);
            
            handSizeInPixels = Math.hypot(wristPos.x - middleMcpPos.x, wristPos.y - middleMcpPos.y);
        }
    }
    // (🚨 이전 코드에서는 여기에 닫는 괄호 '}'가 있었습니다. 그것이 오류입니다.)

    
    // 2. [핵심 상태 관리 로직 (허용 오차 적용됨)]
    // (이 로직은 함수 *안에* 있어야 합니다)
    
    if (isDragging) {
        // [상태 A: 이미 드래그 중일 때]
        
        if (isPinching) {
            // A-1: 핀치를 '유지'하고 있음
            
            pinchReleaseCounter = 0; // 핀치 놓침 카운터 리셋
            
            // 원의 위치를 현재 손가락 위치로 이동
            objectPos.x = pinchMidPoint.x;
            objectPos.y = pinchMidPoint.y;
            
            // ⭐️ 요청하신 튜닝 값으로 원의 크기를 조절 ⭐️
            const MIN_HAND_SIZE = 30;   // ✅ 수정됨
            const MAX_HAND_SIZE = 250;  // ✅ 수정됨
            const MIN_RADIUS = 10;      // ✅ 수정됨
            const MAX_RADIUS = 80;      // ✅ 수정됨
            objectRadius = mapRange(handSizeInPixels, MIN_HAND_SIZE, MAX_HAND_SIZE, MIN_RADIUS, MAX_RADIUS);
            
        } else if (isHandDetected) {
            // A-2: 핀치를 '놓쳤지만' (플리커링) 손은 아직 보임
            pinchReleaseCounter++; // 카운터 증가
            
            if (pinchReleaseCounter > PINCH_RELEASE_TOLERANCE) {
                // 허용 오차 초과: 진짜로 놓은 것으로 판단
                isDragging = false;
                pinchReleaseCounter = 0; 
            }
            // else: (아직 허용 오차 범위 내) -> isDragging = true 유지
            
        } else {
            // A-3: 손이 아예 사라짐
            isDragging = false; // 즉시 드래그 종료
            pinchReleaseCounter = 0;
        }
        
    } else {
        // [상태 B: 드래그 중이 아닐 때]
        
        pinchReleaseCounter = 0; // 카운터 리셋
        
        if (isPinching) {
            // B-1: 핀치를 '시작'함
            const isOverlapping = isPointInCircle(pinchMidPoint, objectPos, objectRadius);
            
            if (isOverlapping) {
                // [드래그 시작!]
                isDragging = true; 
                
                // (첫 프레임 위치/크기 업데이트 - 여기도 튜닝 값 적용)
                objectPos.x = pinchMidPoint.x;
                objectPos.y = pinchMidPoint.y;
                
                const MIN_HAND_SIZE = 30;
                const MAX_HAND_SIZE = 250;
                const MIN_RADIUS = 10;
                const MAX_RADIUS = 80;
                objectRadius = mapRange(handSizeInPixels, MIN_HAND_SIZE, MAX_HAND_SIZE, MIN_RADIUS, MAX_RADIUS);
            }
        }
    }

    // 3. [최종 그리기]
    // (이 로직도 함수 *안에* 있어야 합니다)
    drawCircle(objectPos.x, objectPos.y, objectRadius, isDragging ? "red" : "blue");

} // ✅✅✅ 여기가 함수의 *올바른* 끝입니다! ✅✅✅
    

// --- 유틸리티 함수 (main.js 하단에 추가) ---

// 점(point)이 원(center, radius) 안에 있는지 확인
function isPointInCircle(point, center, radius) {
    if (!point) return false;
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    return distance < radius;
}

// 캔버스에 원을 그리는 함수
function drawCircle(x, y, radius, color) {
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, radius, 0, 2 * Math.PI);
    canvasCtx.fillStyle = color;
    canvasCtx.fill();
    canvasCtx.strokeStyle = "white";
    canvasCtx.lineWidth = 3;
    canvasCtx.stroke();
}

/**
 * 값의 범위를 다른 범위로 매핑하는 함수 (예: 100-500 -> 10-20)
 * @param {number} value - 매핑할 값
 * @param {number} inMin - 입력값의 최소
 * @param {number} inMax - 입력값의 최대
 * @param {number} outMin - 출력값의 최소
 * @param {number} outMax - 출력값의 최대
 * @returns {number} - 매핑된 값
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
    // 입력값을 0-1 범위로 정규화
    const normalizedValue = (value - inMin) / (inMax - inMin);
    // 정규화된 값을 출력 범위로 변환
    const mappedValue = normalizedValue * (outMax - outMin) + outMin;
    // 값이 출력 범위를 벗어나지 않도록 'clamp'(제한)
    return Math.max(outMin, Math.min(outMax, mappedValue));
}
/**
 * [추가!] MediaPipe 랜드마크를 캔버스 픽셀 좌표로 변환 (좌우 반전 포함)
 * @param {object} landmark - MediaPipe 랜드마크 (x, y, z 포함)
 * @param {number} canvasWidth - 캔버스 너비
 * @param {number} canvasHeight - 캔버스 높이
 * @returns {object} - {x, y} 픽셀 좌표
 */
function getPixelPos(landmark, canvasWidth, canvasHeight) {
    return {
        x: (1 - landmark.x) * canvasWidth, // 좌우 반전
        y: landmark.y * canvasHeight
    };
}




// --- 실행 ---
setupMediaPipe()
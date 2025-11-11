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

// --- 이 부분은 아래 3단계에서 채워나갑니다 ---
// main.js 의 맨 아래에 추가

// (E) --- 5. 핵심 로직: 상호작용 처리 함수 ---
// (이 함수 전체를 아래 코드로 교체하세요)
function handleObjectInteraction(results) {
    
    // 로컬(지역) 변수로 상태를 초기화합니다.
    let isPinching = false;
    let pinchMidPoint = null;
    let isOverlapping = false; // '겹침' 상태를 저장할 변수

    // 1. [손 감지 확인]
    if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0]; 
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // 2. [좌표 변환]
        const canvasWidth = canvasElement.width;
        const canvasHeight = canvasElement.height;
        const thumbPos = { x: (1 - thumbTip.x) * canvasWidth, y: thumbTip.y * canvasHeight };
        const indexPos = { x: (1 - indexTip.x) * canvasWidth, y: indexTip.y * canvasHeight };

        // 3. [핀치(Pinch) 감지]
        const distance = Math.hypot(thumbPos.x - indexPos.x, thumbPos.y - indexPos.y);
        const pinchThreshold = 40;

        if (distance < pinchThreshold) {
            // 핀치 중일 때
            isPinching = true;
            pinchMidPoint = { 
                x: (thumbPos.x + indexPos.x) / 2, 
                y: (thumbPos.y + indexPos.y) / 2 
            };
            
            // 4. [겹침(Overlap) 확인]
            // 핀치한 위치가 *현재* 원의 반경 내에 있는지 확인합니다.
            isOverlapping = isPointInCircle(pinchMidPoint, objectPos, objectRadius);
        }
        // (핀치하지 않으면 isPinching과 isOverlapping은 모두 false로 유지됩니다)
    }
    // (손이 감지되지 않아도 isPinching과 isOverlapping은 모두 false로 유지됩니다)


    // 5. [상태 관리 및 로직 실행]
    // ⭐️ 사용자 요청의 핵심 로직입니다: "핀치 중" AND "겹침"
    if (isPinching && isOverlapping) {
        // [상태 A: 잡기 시작 또는 잡고 있는 중]
        
        // 1. '잡기' 상태로 만듭니다.
        isDragging = true;
        
        // 2. 원의 크기를 조절합니다. (손 크기 계산 로직)
        const landmarks = results.landmarks[0];
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        const canvasWidth = canvasElement.width;
        const canvasHeight = canvasElement.height;
        const wristPos = { x: (1 - wrist.x) * canvasWidth, y: wrist.y * canvasHeight };
        const middleMcpPos = { x: (1 - middleMcp.x) * canvasWidth, y: middleMcp.y * canvasHeight };
        const handSizeInPixels = Math.hypot(wristPos.x - middleMcpPos.x, wristPos.y - middleMcpPos.y);
        

        //손크기 확인용 콘솔 출력
        //console.log("현재 손 크기 (픽셀):", handSizeInPixels);


        //손크기 민감도
        const MIN_HAND_SIZE = 30, MAX_HAND_SIZE = 250;
        const MIN_RADIUS = 10, MAX_RADIUS = 80;




        objectRadius = mapRange(handSizeInPixels, MIN_HAND_SIZE, MAX_HAND_SIZE, MIN_RADIUS, MAX_RADIUS);
        
        // 3. 원의 위치를 손가락 위치로 이동시킵니다.
        objectPos.x = pinchMidPoint.x;
        objectPos.y = pinchMidPoint.y;

    } else {
        // [상태 B: 핀치를 놓았거나(isPinching=F) 원 밖에서 핀치할 때(isOverlapping=F)]
        
        // 1. '잡기' 상태를 해제합니다.
        isDragging = false;
        
        // 2. 원의 크기를 기본값으로 되돌립니다.
        //objectRadius = DEFAULT_RADIUS;
        
        // (원의 위치는 마지막 자리에 고정됩니다)
    }

    // 6. [최종 그리기]
    // isDragging 상태에 따라 색상을 변경하여 그립니다.
    drawCircle(objectPos.x, objectPos.y, objectRadius, isDragging ? "red" : "blue");
}
    

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





// --- 실행 ---
setupMediaPipe();
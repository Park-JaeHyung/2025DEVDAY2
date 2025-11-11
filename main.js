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
let objectPos = { x: 320, y: 240 }; // 원의 중심 (초기값: 캔버스 중앙)
const objectRadius = 30; // 원의 반지름
let isDragging = false; // 현재 드래그 중인지 여부





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

function handleObjectInteraction(results) {
    
    // 기본값: 손이 없거나 핀치 안 함
    let isPinching = false;
    let pinchMidPoint = null; 

    // 1. 손 인식 결과 확인
    if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0]; // 첫 번째 손

        // MediaPipe 랜드마크 인덱스: 4번(엄지 끝), 8번(검지 끝)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // [중요] MediaPipe 좌표는 0.0~1.0의 정규화된 좌표입니다.
        // 실제 캔버스 픽셀 좌표로 변환해야 합니다. (좌우 반전 고려)
        const canvasWidth = canvasElement.width;
        const canvasHeight = canvasElement.height;

        // 좌우 반전되었으므로 x 좌표는 (1 - x) * width
        const thumbPos = { x: (1 - thumbTip.x) * canvasWidth, y: thumbTip.y * canvasHeight };
        const indexPos = { x: (1 - indexTip.x) * canvasWidth, y: indexTip.y * canvasHeight };

        // 2. 핀치(Pinch) 동작 감지
        const distance = Math.hypot(thumbPos.x - indexPos.x, thumbPos.y - indexPos.y);
        const pinchThreshold = 40; // 픽셀 기준 임계값 (조정 필요)

        if (distance < pinchThreshold) {
            isPinching = true;
            // 핀치 중간 지점을 계산
            pinchMidPoint = { 
                x: (thumbPos.x + indexPos.x) / 2, 
                y: (thumbPos.y + indexPos.y) / 2 
            };
        }
    }

    // 3. 오브젝트와 상호작용 로직 (State Machine)
    
    if (!isDragging) {
        // [상태 1: 드래그 시작]
        // 드래그 중이 아닐 때 + 핀치를 했고 + 핀치 위치가 원 안이라면
        if (isPinching && isPointInCircle(pinchMidPoint, objectPos, objectRadius)) {
            isDragging = true;
        }
    } else {
        // [상태 2: 드래그 중]
        // 드래그 중인데 핀치를 계속하고 있다면
        if (isPinching) {
            // 원의 위치를 핀치 중간 지점으로 이동
            objectPos.x = pinchMidPoint.x;
            objectPos.y = pinchMidPoint.y;
        } 
        // [상태 3: 드래그 종료]
        // 드래그 중인데 핀치를 놓았다면
        else {
            isDragging = false;
        }
    }

    // 4. 캔버스에 원 그리기
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

// --- 실행 ---
setupMediaPipe();
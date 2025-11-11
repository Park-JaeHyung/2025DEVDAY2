# 2025DEVDAY1
<!DOCTYPE html> <html> <head> <title>MediaPipe Hand Tracking Drag & Drop</title> <style> /* CSS 스타일을 정의하는 영역입니다. */
        /* 캔버스와 비디오를 겹치게 하기 위한 컨테이너 설정 */
        #container { 
            position: relative; /* 자식 요소(video, canvas)의 'absolute' 위치 기준이 됩니다. */
        }
        
        /* 캔버스와 웹캠 비디오의 공통 스타일 */
        #webcam, #output_canvas {
            position: absolute; /* 부모(#container)를 기준으로 위치를 지정합니다. */
            top: 0; /* 위쪽 여백 0 */
            left: 0; /* 왼쪽 여백 0 (서로 겹치게 함) */
            width: 640px; /* 너비를 640px로 고정합니다. */
            height: 480px; /* 높이를 480px로 고정합니다. */
        }

        /* * 웹캠 비디오 스타일 수정 (깜빡임 해결)
         * 'display: none;' 대신 투명하게 만들고 위치를 고정합니다.
         * 브라우저가 비디오 렌더링을 멈추지 않게 하여 깜빡임을 방지합니다.
         */
        #webcam {
            opacity: 0; /* 비디오를 완전히 투명하게 만듭니다. (사용자 눈에 안 보임) */
            /* 'position: absolute', 'top', 'left'는 공통 스타일에서 이미 적용되었습니다. */
        }
        
    </style>
</head>
<body> <h1>엄지 검지로 원을 옮겨보세요</h1>

    <div id="container">
        <video id="webcam" autoplay playsinline></video>
        
        <canvas id="output_canvas" width="640" height="480"></canvas>
    </div>

    <script type="module" src="main.js"></script> 
    
</body> </html> ```

---

### 2. `main.js` (핵심 로직)

MediaPipe 설정, 웹캠 실행, 손 인식, 핀치 감지, 캔버스 그리기 등 모든 실제 동작을 담당합니다.

```javascript
// (A) --- 1. 필수 모듈 임포트 ---
// MediaPipe의 HandLandmarker(손 인식 AI)와 FilesetResolver(모델 파일 로더)를 불러옵니다.
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

// (B) --- 2. 전역 변수 및 DOM 요소 설정 ---

// HTML에서 'webcam' ID를 가진 비디오 요소를 찾아 변수에 저장합니다.
const video = document.getElementById("webcam");
// HTML에서 'output_canvas' ID를 가진 캔버스 요소를 찾아 변수에 저장합니다.
const canvasElement = document.getElementById("output_canvas");
// 캔버스에 그림을 그릴 때 사용할 2D 컨텍스트를 가져옵니다.
const canvasCtx = canvasElement.getContext("2d");

// MediaPipe HandLandmarker AI 모델 인스턴스를 저장할 변수입니다. (초기값 null)
let handLandmarker;
// 마지막으로 처리된 비디오의 시간(초)을 저장할 변수입니다. (중복 처리 방지용)
let lastVideoTime = -1;
// AI가 감지한 마지막 결과를 저장할 변수입니다. (깜빡임 방지용)
// predictWebcam 루프가 AI 감지보다 빠르게 돌 때, 이전 결과를 재사용하기 위함입니다.
let results = null; 

// 원(오브젝트)의 상태를 관리하는 변수들
let objectPos = { x: 320, y: 240 }; // 원의 현재 중심 좌표 (초기값: 캔버스 중앙)
const objectRadius = 30; // 원의 반지름 (픽셀)
let isDragging = false; // 현재 사용자가 원을 '잡고'(드래그) 있는지 여부 (상태 변수)

// (C) --- 3. MediaPipe 및 웹캠 초기화 함수 ---

// 비동기(async) 함수로 MediaPipe를 설정합니다. (모델 로딩에 시간이 걸리기 때문)
async function setupMediaPipe() {
    // 1. MediaPipe 모델 파일(.wasm - 웹어셈블리)이 있는 경로를 설정합니다.
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    // 2. HandLandmarker AI 모델을 생성하고 설정합니다.
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            // 실제 AI 모델 파일(.task)의 경로를 지정합니다. (404 오류 수정된 경로)
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU" // 가능한 경우 GPU를 사용하여 AI 연산을 가속합니다.
        },
        runningMode: "VIDEO", // 비디오 스트림을 실시간으로 처리할 모드로 설정합니다.
        numHands: 1 // 인식할 최대 손의 개수를 1개로 제한합니다. (성능 향상)
    });
    
    // 3. 모델 로딩이 완료되었음을 콘솔에 알립니다. (디버깅용)
    console.log("HandLandmarker 준비 완료");

    // 4. 웹캠을 활성화합니다.
    navigator.mediaDevices.getUserMedia({ video: true }) // 사용자에게 비디오(웹캠) 사용 권한을 요청합니다.
        .then((stream) => { // 사용자가 '허용'한 경우 (Promise가 성공)
            video.srcObject = stream; // 받아온 비디오 스트림을 <video> 요소의 소스로 연결합니다.
            video.addEventListener("loadeddata", () => { // 비디오 데이터가 실제로 로드되기 시작하면
                // 메인 루프인 predictWebcam 함수를 처음으로 호출하여 시작합니다.
                requestAnimationFrame(predictWebcam);
            });
        })
        .catch(err => console.error("웹캠 접근 오류:", err)); // 사용자가 '거부'하거나 오류가 발생한 경우
}

// (D) --- 4. 메인 루프 함수 (매 프레임 실행) ---

// requestAnimationFrame에 의해 1초에 약 60번씩 반복 실행되는 함수입니다.
function predictWebcam() {
    // 1. 캔버스 크기를 비디오의 실제 크기에 맞춥니다. (비디오 해상도가 다를 경우 대비)
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    // 2. 비디오의 현재 재생 시간(초)을 가져옵니다.
    const videoTime = video.currentTime;
    
    // 3. [AI 감지] - AI 감지는 성능을 위해 '새 비디오 프레임'이 들어왔을 때만 실행합니다.
    // (비디오 시간(videoTime)이 이전 시간(lastVideoTime)과 다를 때)
    if (videoTime !== lastVideoTime && handLandmarker) {
        lastVideoTime = videoTime; // 마지막 처리 시간 갱신
        // MediaPipe에 현재 비디오 화면을 주고 손 인식을 *요청*합니다.
        // 결과는 전역 변수 'results'에 저장됩니다. (깜빡임 방지)
        results = handLandmarker.detectForVideo(video, performance.now());
    }

    // --- 4. [그리기] - 그리기는 AI 감지 여부와 상관없이 '매 프레임' 무조건 실행합니다. ---
    // (이것이 깜빡임을 막는 핵심입니다. AI가 멈춰도 그리기는 멈추지 않습니다.)
    
    // 4-1. 캔버스를 깨끗하게 지웁니다. (이전 프레임을 삭제)
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 4-2. 웹캠 영상을 캔버스에 그립니다. (좌우 반전)
    canvasCtx.save(); // 현재 캔버스 상태(좌표계)를 저장합니다.
    canvasCtx.scale(-1, 1); // 캔버스 좌표계를 X축(-1) 기준으로 뒤집습니다. (거울 모드)
    canvasCtx.translate(-canvasElement.width, 0); // 뒤집힌 좌표계를 다시 캔버스 영역으로 이동시킵니다.
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height); // 비디오 화면을 그립니다.
    canvasCtx.restore(); // 저장했던 캔버스 상태(좌표계)를 원상 복구합니다. (다음 그리기에 영향 X)

    // 4-3. 오브젝트(원) 로직을 처리하고 그립니다.
    if (results) { // AI가 손을 한 번이라도 감지했다면 (results에 값이 있다면)
        // 가장 마지막에 감지된 'results'를 기반으로 상호작용 로직을 실행합니다.
        handleObjectInteraction(results);
    }

    // 5. 이 함수(predictWebcam)를 다음 프레임에 다시 실행하도록 브라우저에 요청합니다. (무한 루프)
    requestAnimationFrame(predictWebcam);
}

// (E) --- 5. 핵심 로직: 상호작용 처리 함수 ---

// AI 감지 결과(results)를 받아와 실제 동작을 '판단'하는 함수입니다.
function handleObjectInteraction(results) {
    
    // 기본값 설정: 손이 없거나 핀치하지 않은 상태
    let isPinching = false; // 핀치 중인가?
    let pinchMidPoint = null; // 핀치한 두 손가락의 중간 지점 좌표


    // 1. [손 감지 확인] 손 랜드마크(관절)가 감지되었는지 확인합니다.
    if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0]; // 첫 번째로 감지된 손의 21개 관절 좌표 배열

        // MediaPipe 랜드마크 인덱스: 4번(엄지 끝), 8번(검지 끝)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];

        // 2. [좌표 변환] MediaPipe의 정규화 좌표(0.0~1.0)를 캔버스 픽셀 좌표로 변환합니다.
        const canvasWidth = canvasElement.width;
        const canvasHeight = canvasElement.height;

        // 좌우 반전(거울 모드)을 고려하여 X 좌표를 계산합니다. (1 - x) * width
        const thumbPos = { x: (1 - thumbTip.x) * canvasWidth, y: thumbTip.y * canvasHeight };
        const indexPos = { x: (1 - indexTip.x) * canvasWidth, y: indexTip.y * canvasHeight };

        // 3. [핀치(Pinch) 감지] 엄지(4번)와 검지(8번) 사이의 거리를 계산합니다.
        // Math.hypot(dx, dy)는 유클리드 거리(피타고라스 정리)를 계산합니다. sqrt(dx*dx + dy*dy)
        const distance = Math.hypot(thumbPos.x - indexPos.x, thumbPos.y - indexPos.y);
        const pinchThreshold = 40; // 핀치로 인정할 최대 거리 (40픽셀, 이 값은 조절 가능)

        // 4. [핀치 확정] 거리가 임계값보다 가까우면 '핀치 중'으로 판단합니다.
        if (distance < pinchThreshold) {
            isPinching = true;
            // 두 손가락의 '중간 지점'을 계산합니다.
            pinchMidPoint = { 
                x: (thumbPos.x + indexPos.x) / 2, 
                y: (thumbPos.y + indexPos.y) / 2 
            };
        }
    } // (손 감지 확인 끝)

    // 5. [상태 관리 로직] 'isDragging' 상태에 따라 오브젝트를 제어합니다.
    
    if (!isDragging) {
        // [상태 1: 드래그 시작]
        // (조건 1) 현재 드래그 중이 아니고,
        // (조건 2) 핀치(isPinching)를 했고,
        // (조건 3) 그 핀치 지점(pinchMidPoint)이 원(objectPos) 안에 있다면 (충돌 감지)
        if (isPinching && isPointInCircle(pinchMidPoint, objectPos, objectRadius)) {
            isDragging = true; // '드래그 중' 상태로 변경! (이제부터 원이 손을 따라다님)
        }
    } else { // 'isDragging'이 true일 때 (이미 원을 잡고 있을 때)
        // [상태 2: 드래그 중]
        // (조건 1) 현재 드래그 중이고,
        // (조건 2) 핀치(isPinching)를 계속하고 있다면
        if (isPinching) {
            // 원의 위치(objectPos)를 핀치 중간 지점(pinchMidPoint)으로 계속 이동시킵니다.
            objectPos.x = pinchMidPoint.x;
            objectPos.y = pinchMidPoint.y;
        } 
        // [상태 3: 드래그 종료]
        // (조건 1) 현재 드래그 중인데,
        // (조건 2) 핀치를 놓았다면 (isPinching == false)
        else {
            isDragging = false; // '드래그 중이 아님' 상태로 변경! (원은 그 자리에 고정됨)
        }
    }

    // 6. [최종 그리기] 현재 상태에 따라 원을 캔버스에 그립니다.
    // 'predictWebcam'에서 매번 캔버스를 지우므로, 이 함수도 매번 원을 그려야 합니다.
    // 드래그 중(isDragging)이면 빨간색, 아니면 파란색으로 그립니다.
    drawCircle(objectPos.x, objectPos.y, objectRadius, isDragging ? "red" : "blue");
}

// (F) --- 6. 유틸리티 함수 (보조 함수) ---

/**
 * 점(point)이 원(center, radius) 안에 있는지 확인하는 함수
 * @param {object} point - {x, y} 좌표를 가진 점 (핀치 중간 지점)
 * @param {object} center - {x, y} 좌표를 가진 원의 중심
 * @param {number} radius - 원의 반지름
 * @returns {boolean} - 점이 원 안에 있으면 true
 */
function isPointInCircle(point, center, radius) {
    if (!point) return false; // 핀치 지점(point)이 없으면(손이 없으면) false 반환
    // 점과 원 중심 사이의 거리를 계산합니다.
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    // 그 거리가 반지름보다 작으면 원 '안'에 있는 것입니다.
    return distance < radius;
}

/**
 * 캔버스에 원을 그리는 함수
 * @param {number} x - 원의 중심 x 좌표
 * @param {number} y - 원의 중심 y 좌표
 * @param {number} radius - 원의 반지름
 * @param {string} color - 원의 채우기 색상
 */
function drawCircle(x, y, radius, color) {
    canvasCtx.beginPath(); // 새 그리기 경로를 시작합니다.
    canvasCtx.arc(x, y, radius, 0, 2 * Math.PI); // (x, y) 위치에 반지름(radius)만큼 원을 그립니다. (0 ~ 360도)
    canvasCtx.fillStyle = color; // 원의 내부 채우기 색상을 설정합니다.
    canvasCtx.fill(); // 색상으로 채웁니다.
    canvasCtx.strokeStyle = "white"; // 원의 테두리 색상을 설정합니다.
    canvasCtx.lineWidth = 3; // 원의 테두리 두께를 설정합니다.
    canvasCtx.stroke(); // 테두리를 그립니다.
}

// (G) --- 7. 프로그램 시작 ---

// 맨 처음에 정의한 MediaPipe 설정 함수를 호출하여 모든 것을 시작합니다.
setupMediaPipe();










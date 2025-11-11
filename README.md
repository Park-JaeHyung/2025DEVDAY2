<!DOCTYPE html> <html> <head> <title>MediaPipe Hand Tracking Drag & Drop</title> <style> /* CSS (디자인) 코드를 작성하는 영역입니다. */
        /* body 태그의 기본 여백(margin)을 0으로 설정하여 화면에 꽉 차게 합니다. */
        body {
            margin: 0;
            overflow: hidden; /* 캔버스가 창보다 커져도 스크롤바가 생기지 않도록 숨깁니다. */
        }

        /* 캔버스와 비디오를 묶는 부모 컨테이너입니다. */
        #container { 
            position: relative; /* 자식 요소(#webcam, #output_canvas)의 'absolute' 위치 기준점이 됩니다. */
        }
        
        /* 웹캠 비디오와 캔버스에 공통으로 적용될 스타일입니다. */
        #webcam, #output_canvas {
            position: absolute; /* 부모(#container)를 기준으로 위치가 고정됩니다. */
            top: 0; /* 부모의 맨 위에 붙입니다. */
            left: 0; /* 부모의 맨 왼쪽에 붙입니다. */
            width: 960px; /* 캔버스와 비디오의 너비를 960px로 고정합니다. */
            height: 720px; /* 캔버스와 비디오의 높이를 720px로 고정합니다. */
        }

        /* 웹캠 비디오(<video>) 태그에만 적용될 스타일입니다. */
        #webcam {
            /* * 'display: none;'을 쓰면 브라우저가 비디오를 멈춰서 깜빡임이 발생합니다.
             * 'opacity: 0;' (투명도 0)을 사용하면, 비디오는 계속 재생되지만 사용자 눈에는 보이지 않아 깜빡임이 해결됩니다.
             */
            opacity: 0;
        }
    </style>
</head>
<body> <h1>엄지 검지로 원을 옮겨보세요</h1>

    <div id="container">
        <video id="webcam" autoplay playsinline></video>
        
        <canvas id="output_canvas" width="960" height="720"></canvas>
    </div>

    <script type="module" src="main.js"></script> 
    
</body> </html> ```

---

###  javascript 2. `main.js` (핵심 로직)

```javascript
// (A) --- 1. 필수 모듈 임포트 ---
// MediaPipe의 HandLandmarker(손 인식 AI)와 FilesetResolver(모델 파일 로더)를 불러옵니다.
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js";

// (B) --- 2. 전역 변수 및 DOM 요소 설정 ---

// HTML의 <video id="webcam"> 요소를 찾아서 video 변수에 저장합니다.
const video = document.getElementById("webcam");
// HTML의 <canvas id="output_canvas"> 요소를 찾아서 canvasElement 변수에 저장합니다.
const canvasElement = document.getElementById("output_canvas");
// 캔버스에 그림을 그릴 때 사용할 2D 그리기 도구(컨텍스트)를 가져옵니다.
const canvasCtx = canvasElement.getContext("2d");

// MediaPipe의 HandLandmarker 인스턴스를 저장할 변수입니다. (초기에는 비어있음)
let handLandmarker;
// 마지막으로 처리한 비디오 프레임의 시간을 저장합니다. (중복 처리 방지용)
let lastVideoTime = -1;
// MediaPipe가 감지한 마지막 결과(손 위치 등)를 저장합니다. (깜빡임 방지용)
let results = null; 

// --- 오브젝트(원) 상태 변수 ---
// 원의 현재 중심 좌표를 저장합니다. (초기값: 320, 240)
let objectPos = { x: 320, y: 240 }; 
// 원의 현재 반지름을 저장합니다. (핀치 시 이 값이 변합니다)
let objectRadius = 30; 
// 핀치를 놓았을 때의 기본 반지름 크기(상수)입니다. (현재 로직에서는 사용되지 않음)
const DEFAULT_RADIUS = 30; 
// 현재 사용자가 원을 '잡고'(드래그) 있는지 여부를 저장하는 '메모리' 변수입니다. (가장 중요)
let isDragging = false;

// --- 핀치 놓침 허용 오차(Debouncing) 변수 ---
// 핀치를 놓친 프레임 수를 셉니다. (데이터 노이즈로 인한 '떨어짐' 방지)
let pinchReleaseCounter = 0; 
// 핀치를 놓쳤다고 판단하기까지 '봐줄' 프레임 수입니다. (5프레임 = 약 0.08초)
const PINCH_RELEASE_TOLERANCE = 5; 


// (C) --- 3. MediaPipe 및 웹캠 초기화 함수 ---

// async: 이 함수 내에서 await(비동기 대기)를 사용하겠다는 의미입니다.
async function setupMediaPipe() {
    // 1. MediaPipe AI 모델 실행에 필요한 리소스(.wasm 파일) 경로를 설정합니다.
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    
    // 2. HandLandmarker AI 모델을 생성하고 옵션을 설정합니다.
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            // 실제 손 인식 AI 모델 파일(.task)의 경로입니다.
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU" // 가능한 경우 GPU를 사용해 AI 연산을 가속합니다.
        },
        runningMode: "VIDEO", // 실시간 비디오 스트림을 처리할 모드입니다.
        numHands: 1 // 인식할 최대 손의 개수를 1개로 제한합니다. (성능 향상)
    });
    
    // 3. 모델 로딩이 완료되었음을 개발자 콘솔에 알립니다.
    console.log("HandLandmarker 준비 완료");

    // 4. 웹캠 실행
    // 사용자의 미디어 기기(웹캠)에 접근 권한을 요청합니다.
    navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => { // 사용자가 '허용'했을 때 실행됩니다.
            video.srcObject = stream; // <video> 태그에 웹캠 스트림을 연결합니다.
            // 비디오 데이터가 실제로 로드되기 시작하면 이벤트가 발생합니다.
            video.addEventListener("loadeddata", () => {
                // 메인 루프(predictWebcam)를 처음으로 호출하여 프로그램을 시작합니다.
                requestAnimationFrame(predictWebcam);
            });
        })
        .catch(err => console.error("웹캠 접근 오류:", err)); // 사용자가 '거부'했거나 오류가 발생했을 때 실행됩니다.
}

// (D) --- 4. 메인 루프 함수 (매 프레임 실행) ---

// 1초에 약 60번씩(브라우저 화면 주사율에 맞춰) 계속 반복 실행되는 함수입니다.
function predictWebcam() {
    // 캔버스의 실제 픽셀 크기(drawing buffer)를 HTML 태그에 고정된 크기(960x720)로 사용합니다.
    // 따라서 이 함수 내에서 캔버스 크기를 매번 설정할 필요가 없습니다. (관련 코드 삭제됨)

    // 비디오의 현재 재생 시간을 가져옵니다.
    const videoTime = video.currentTime;
    
    // 1. [AI 감지] - 성능 최적화
    // (조건 1) 비디오 프레임이 새로 갱신되었고(videoTime !== lastVideoTime),
    // (조건 2) AI 모델(handLandmarker)이 준비되었을 때만 AI 감지를 실행합니다.
    if (videoTime !== lastVideoTime && handLandmarker) {
        lastVideoTime = videoTime; // 마지막 처리 시간을 현재 시간으로 갱신합니다.
        // AI 모델에 현재 비디오 화면을 입력하여 손 인식을 수행합니다.
        // 결과는 전역 변수 'results'에 저장됩니다. (깜빡임 방지용)
        results = handLandmarker.detectForVideo(video, performance.now());
    }

    // --- 2. [그리기] ---
    // AI 감지 여부와 상관없이, 그리기는 매 프레임 '무조건' 실행됩니다.
    // (이것이 AI 처리 지연으로 인한 화면 깜빡임을 막아줍니다.)
    
    // 2-1. 캔버스를 깨끗하게 지웁니다. (이전 프레임의 그림을 삭제)
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 2-2. 웹캠 영상을 캔버스에 그립니다.
    canvasCtx.save(); // 현재 캔버스 상태(좌표계)를 저장합니다.
    canvasCtx.scale(-1, 1); // X축을 기준으로 캔버스 좌표계를 뒤집습니다. (거울 모드)
    canvasCtx.translate(-canvasElement.width, 0); // 뒤집힌 좌표계를 다시 캔버스 영역으로 이동시킵니다.
    // 캔버스에 <video>의 현재 프레임을 그립니다.
    canvasCtx.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore(); // 저장했던 캔버스 상태(좌표계)를 원래대로 복구합니다.

    // 2-3. 오브젝트(원) 로직을 처리하고 그립니다.
    if (results) { // AI가 손을 한 번이라도 감지했다면(results에 값이 있다면),
        handleObjectInteraction(results); // 마지막 감지 결과로 상호작용 로직을 실행합니다.
    }

    // 3. 다음 화면 갱신 타이밍에 이 함수(predictWebcam)를 다시 실행하도록 브라우저에 요청합니다. (무한 루프)
    requestAnimationFrame(predictWebcam);
}

// (E) --- 5. 핵심 로직: 상호작용 처리 함수 ---
// AI 감지 결과(results)를 받아와, '핀치' 여부, '잡기' 상태 등을 판단하고 실행합니다.
function handleObjectInteraction(results) {
    
    // 1. [제스처 계산]
    // 이 함수가 실행될 때마다 제스처 관련 변수를 초기화합니다.
    let isPinching = false; // 이번 프레임에 핀치 중인가?
    let pinchMidPoint = null; // 핀치한 두 손가락의 중간 지점
    let handSizeInPixels = 0; // 손의 2D 픽셀 크기 (거리 대용)
    // results.landmarks(손 관절 데이터)가 존재하고, 그 배열의 길이가 0보다 큰지(손이 1개 이상 감지됨) 확인합니다.
    let isHandDetected = (results.landmarks && results.landmarks.length > 0);
    
    // 캔버스 크기를 한 번만 가져옵니다. (좌표 변환 시 필요)
    const canvasWidth = canvasElement.width;
    const canvasHeight = canvasElement.height;

    if (isHandDetected) {
        // 손이 감지되었다면:
        const landmarks = results.landmarks[0]; // 첫 번째 손의 21개 관절 좌표 배열
        const thumbTip = landmarks[4]; // 4번 관절 (엄지 끝)
        const indexTip = landmarks[8]; // 8번 관절 (검지 끝)

        // 헬퍼 함수(getPixelPos)를 사용해 정규화 좌표(0.0~1.0)를 픽셀 좌표로 변환합니다.
        const thumbPos = getPixelPos(thumbTip, canvasWidth, canvasHeight);
        const indexPos = getPixelPos(indexTip, canvasWidth, canvasHeight);

        // 두 손가락 끝 사이의 픽셀 거리(유클리드 거리)를 계산합니다.
        const distance = Math.hypot(thumbPos.x - indexPos.x, thumbPos.y - indexPos.y);
        const pinchThreshold = 40; // 핀치로 인정할 최대 거리 (40픽셀)

        if (distance < pinchThreshold) {
            // 핀치로 인정될 때:
            isPinching = true; // 핀치 중이라고 표시합니다.
            // 두 손가락의 '중간 지점' 좌표를 계산합니다.
            pinchMidPoint = { 
                x: (thumbPos.x + indexPos.x) / 2, 
                y: (thumbPos.y + indexPos.y) / 2 
            };
            
            // 손 크기 계산 (원의 크기 조절에 사용)
            const wrist = landmarks[0]; // 0번 관절 (손목)
            const middleMcp = landmarks[9]; // 9번 관절 (가운데 손가락 뿌리)

            // 헬퍼 함수로 픽셀 좌표 변환
            const wristPos = getPixelPos(wrist, canvasWidth, canvasHeight);
            const middleMcpPos = getPixelPos(middleMcp, canvasWidth, canvasHeight);
            
            // 손목과 손바닥 사이의 거리를 '손 크기(거리)'로 사용합니다.
            handSizeInPixels = Math.hypot(wristPos.x - middleMcpPos.x, wristPos.y - middleMcpPos.y);
        }
        // (else: 거리가 40px보다 멀면 isPinching은 false로 유지됩니다.)
    }
    // (else: 손이 감지되지 않으면 isPinching은 false로 유지됩니다.)

    
    // 2. [핵심 상태 관리 로직 (State Machine)]
    // 전역 변수 'isDragging' (메모리)을 기반으로 현재 상태를 판단하고 다음 행동을 결정합니다.
    
    if (isDragging) {
        // [상태 A: 이미 드래그 중일 때 (isDragging == true)]
        
        if (isPinching) {
            // A-1: 핀치를 '유지'하고 있음 (정상 드래그 상태)
            
            pinchReleaseCounter = 0; // 핀치 놓침 카운터를 0으로 리셋합니다.
            
            // 원의 위치를 현재 핀치 중간 지점으로 이동시킵니다.
            objectPos.x = pinchMidPoint.x;
            objectPos.y = pinchMidPoint.y;
            
            // ⭐️ 사용자가 튜닝한 값으로 원의 크기를 조절합니다 ⭐️
            const MIN_HAND_SIZE = 30;   // 손이 가장 멀 때(작을 때)의 픽셀 크기
            const MAX_HAND_SIZE = 250;  // 손이 가장 가까울 때(클 때)의 픽셀 크기
            const MIN_RADIUS = 10;      // 손이 멀 때의 최소 반지름
            const MAX_RADIUS = 80;      // 손이 가까울 때의 최대 반지름
            // 헬퍼 함수(mapRange)로 손 크기를 원의 반지름으로 변환합니다.
            objectRadius = mapRange(handSizeInPixels, MIN_HAND_SIZE, MAX_HAND_SIZE, MIN_RADIUS, MAX_RADIUS);
            
        } else if (isHandDetected) {
            // A-2: 핀치를 '놓쳤지만'(isPinching=F), 손은 아직 보임 (데이터 노이즈 의심)
            
            pinchReleaseCounter++; // 핀치 놓침 카운터를 1 증가시킵니다.
            
            // 카운터가 우리가 정한 허용 오차(PINCH_RELEASE_TOLERANCE)를 초과했는지 확인합니다.
            if (pinchReleaseCounter > PINCH_RELEASE_TOLERANCE) {
                // 허용 오차 초과: 진짜로 핀치를 놓은 것으로 판단합니다.
                isDragging = false; // 드래그 상태를 해제합니다.
                pinchReleaseCounter = 0; // 카운터를 리셋합니다.
            }
            // else: (아직 허용 오차 범위 내)
            // isDragging = true 상태를 *유지*합니다. (원이 떨어지지 않음)
            
        } else {
            // A-3: 손이 아예 화면에서 사라짐
            isDragging = false; // 즉시 드래그를 종료합니다.
            pinchReleaseCounter = 0; // 카운터를 리셋합니다.
        }
        
    } else {
        // [상태 B: 드래그 중이 아닐 때 (isDragging == false)]
        
        pinchReleaseCounter = 0; // 드래그 중이 아니므로 항상 카운터를 0으로 리셋합니다.
        
        if (isPinching) {
            // B-1: 핀치를 '시작'함
            // 핀치한 위치가 현재 원과 겹치는지(충돌하는지) 확인합니다.
            const isOverlapping = isPointInCircle(pinchMidPoint, objectPos, objectRadius);
            
            if (isOverlapping) {
                // [드래그 시작!]
                isDragging = true; // '잡았다'고 메모리(isDragging)에 기록합니다.
                
                // (첫 프레임 반응성을 위해, 잡는 즉시 위치/크기를 업데이트합니다)
                objectPos.x = pinchMidPoint.x;
                objectPos.y = pinchMidPoint.y;
                
                // ⭐️ 사용자가 튜닝한 값으로 원의 크기를 조절합니다 ⭐️
                const MIN_HAND_SIZE = 30;
                const MAX_HAND_SIZE = 250;
                const MIN_RADIUS = 10;
                const MAX_RADIUS = 80;
                objectRadius = mapRange(handSizeInPixels, MIN_HAND_SIZE, MAX_HAND_SIZE, MIN_RADIUS, MAX_RADIUS);
            }
            // (else: 핀치는 했지만 원 밖 -> 아무것도 안 함)
        }
        // (else: 핀치 안 함 -> 아무것도 안 함)
    }

    // 3. [최종 그리기]
    // 캔버스에 원을 그립니다.
    // isDragging 상태에 따라 색상을 다르게(잡으면 'red', 놓으면 'blue') 지정합니다.
    drawCircle(objectPos.x, objectPos.y, objectRadius, isDragging ? "red" : "blue");

} // --- handleObjectInteraction 함수 끝 ---


// (F) --- 6. 유틸리티 함수 (보조 함수) ---

/**
 * 점(point)이 원(center, radius) 안에 있는지 확인하는 함수
 * @param {object} point - {x, y} 좌표를 가진 점 (핀치 중간 지점)
 * @param {object} center - {x, y} 좌표를 가진 원의 중심
 * @param {number} radius - 원의 반지름
 * @returns {boolean} - 점이 원 안에 있으면 true
 */
function isPointInCircle(point, center, radius) {
    if (!point) return false; // 점이 없으면(핀치 안 함) false 반환
    // 점과 원 중심 사이의 픽셀 거리(유클리드 거리)를 계산합니다.
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
    canvasCtx.beginPath(); // 새 그리기 경로(path)를 시작합니다.
    // (x, y) 위치에 반지름(radius)만큼 원을 그립니다. (0 ~ 2*PI 라디안 = 360도)
    canvasCtx.arc(x, y, radius, 0, 2 * Math.PI); 
    canvasCtx.fillStyle = color; // 원의 내부 채우기 색상을 설정합니다.
    canvasCtx.fill(); // 색상으로 내부를 채웁니다.
    canvasCtx.strokeStyle = "white"; // 원의 테두리 색상을 설정합니다.
    canvasCtx.lineWidth = 3; // 원의 테두리 두께를 3px로 설정합니다.
    canvasCtx.stroke(); // 테두리를 그립니다.
}

/**
 * 값의 범위를 다른 범위로 매핑(변환)하는 함수 (예: 손 크기 30~250 -> 원 크기 10~80)
 * @param {number} value - 변환할 값 (예: handSizeInPixels)
 * @param {number} inMin - 입력값의 최소 (예: MIN_HAND_SIZE)
 * @param {number} inMax - 입력값의 최대 (예: MAX_HAND_SIZE)
 * @param {number} outMin - 출력값의 최소 (예: MIN_RADIUS)
 * @param {number} outMax - 출력값의 최대 (예: MAX_RADIUS)
 * @returns {number} - 변환된 값
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
    // 1. 입력값을 0~1 사이의 비율(정규화)로 변환합니다.
    const normalizedValue = (value - inMin) / (inMax - inMin);
    // 2. 0~1 비율을 출력 범위(outMin~outMax)로 다시 변환합니다.
    const mappedValue = normalizedValue * (outMax - outMin) + outMin;
    // 3. 값이 출력 범위를 벗어나지 않도록 최소/최대값으로 제한(clamp)합니다.
    return Math.max(outMin, Math.min(outMax, mappedValue));
}

/**
 * [추가된 헬퍼 함수] MediaPipe 랜드마크를 캔버스 픽셀 좌표로 변환 (좌우 반전 포함)
 * @param {object} landmark - MediaPipe 랜드마크 (x, y, z 포함)
 * @param {number} canvasWidth - 캔버스 너비
 * @param {number} canvasHeight - 캔버스 높이
 * @returns {object} - {x, y} 픽셀 좌표
 */
function getPixelPos(landmark, canvasWidth, canvasHeight) {
    return {
        x: (1 - landmark.x) * canvasWidth, // 좌우 반전(거울 모드)된 x좌표
        y: landmark.y * canvasHeight      // y좌표
    };
}


// (G) --- 7. 프로그램 시작 ---
// 맨 처음에 정의한 setupMediaPipe 함수를 호출하여 모든 것을 시작합니다.
setupMediaPipe();
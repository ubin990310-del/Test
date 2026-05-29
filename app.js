/* ==========================================================================
   LG Service Manager Registration System - Application Engine
   ========================================================================== */

(function () {
  try {
    if (typeof firebase === 'undefined') {
      alert("🚨 Firebase 라이브러리가 로드되지 않았습니다. 인터넷 연결이나 방화벽을 확인해주세요.");
      return;
    }

    // Firebase 설정 및 초기화
    const firebaseConfig = {
      apiKey: "AIzaSyCzyTqjwruuCmYirGLPSIFZLl8AWCAjSGY",
      authDomain: "system-f72e7.firebaseapp.com",
      databaseURL: "https://system-f72e7-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId: "system-f72e7",
      storageBucket: "system-f72e7.firebasestorage.app",
      messagingSenderId: "1003125382453",
      appId: "1:1003125382453:web:747f82b0a537d072e7807c",
      measurementId: "G-K5FWCXD3GB"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // 1. 상태 객체 정의 (데이터는 Firebase 실시간 DB에 보존)
    const STATE_KEY = 'LGE_REGISTRATION_SYSTEM_STATE_V2';
    let appState = {
      centers: [],       // 센터 목록
      employees: [],     // 전사 구성원 리스트
      classSchedules: {},// 지역별 30개 차수 일정
      currentSimTime: '2026-05-27T17:10:00' // 가상 시스템 시각 (기본값)
    };

    let currentUser = null; // 현재 로그인된 세션 [{ name, sabun, role, centerId, region }]

    // 2. 가상 데이터 생성을 위한 유틸리티
    const REGIONS = ['수도권', '중부/강원실', '서남부/충청실'];
    const RANKS = ['매니저', '선임 매니저', '책임 매니저'];
    
    const LAST_NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'];
    const FIRST_NAMES = [
      '민수', '서준', '예준', '도윤', '시우', '주원', '하준', '지호', '지민', '준우', 
      '지우', '지원', '수아', '하은', '예은', '윤아', '서현', '지아', '소율', '채원',
      '정우', '건우', '우진', '선우', '다현', '서윤', '서연', '민재', '현우', '유진'
    ];

    function generateRandomName() {
      const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      return ln + fn;
    }

    // 3. 차수별 기본 날짜 리스트 생성 (2026년 6월 1일부터 매주 월요일 개강)
    function generateDefaultClassDates() {
      const schedules = {};
      REGIONS.forEach(region => {
        schedules[region] = [];
        let baseDate = new Date('2026-06-01'); // 1차수 시작일
        
        for (let i = 1; i <= 30; i++) {
          // 주말 제외 5일 교육
          const start = new Date(baseDate);
          const end = new Date(baseDate);
          end.setDate(end.getDate() + 4); // 월~금
          
          schedules[region].push({
            classNum: i,
            startDate: formatDate(start),
            endDate: formatDate(end)
          });
          
          // 다음 차수는 1주일 뒤 시작
          baseDate.setDate(baseDate.getDate() + 7);
        }
      });
      return schedules;
    }

    function formatDate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 4. 초기 가상 마스터 데이터 생성 모듈 (실제 데이터 연동)
    function generateInitialState() {
      console.log("Generating initial database from INITIAL_DATA...");
      const state = {
        centers: [],
        employees: [],
        classSchedules: generateDefaultClassDates(),
        currentSimTime: '2026-05-27T17:10:00'
      };

      function mapRegion(rawRegion) {
        if (!rawRegion) return '수도권';
        if (rawRegion.includes('수도권')) return '수도권';
        if (rawRegion.includes('강원') || rawRegion.includes('중부')) return '중부/강원실';
        if (rawRegion.includes('서남부') || rawRegion.includes('충청')) return '서남부/충청실';
        return '수도권'; // 기본값
      }

      let centerIdCounter = 1;
      let employeeIdCounter = 100000;

      const adminData = (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA['로그인계정 정보']) ? INITIAL_DATA['로그인계정 정보'] : [];
      const memberData = (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA['센터 구성원 정보']) ? INITIAL_DATA['센터 구성원 정보'] : [];

      const centerMap = {};

      // 1) 센터장/실장 데이터로 센터 기본 정보 구축
      adminData.forEach(row => {
        const centerName = row['센터명'] || '미지정센터';
        const region = mapRegion(row['담당/실']);
        
        if (!centerMap[centerName]) {
          centerMap[centerName] = {
            id: centerIdCounter++,
            name: centerName,
            region: region,
            leaderName: '',
            leaderSabun: '',
            managerName: '',
            managerSabun: ''
          };
        }
        
        const c = centerMap[centerName];
        if (!c.leaderName) {
          c.leaderName = row['성명'];
          c.leaderSabun = String(row['사번']);
        } else if (!c.managerName) {
          c.managerName = row['성명'];
          c.managerSabun = String(row['사번']);
        }
      });

      // 2) 구성원 데이터로 센터가 비어있으면 추가 및 직원 매핑
      memberData.forEach(row => {
        const centerName = row['센터명'] || '미지정센터';
        if (!centerMap[centerName]) {
          centerMap[centerName] = {
            id: centerIdCounter++,
            name: centerName,
            region: mapRegion(row['담당/실']),
            leaderName: '가상센터장',
            leaderSabun: '99999',
            managerName: '가상실장',
            managerSabun: '88888'
          };
        }
        
        const center = centerMap[centerName];
        const empId = employeeIdCounter++;
        
        state.employees.push({
          id: empId,
          centerId: center.id,
          region: center.region,
          name: row['성명'] || '이름없음',
          sabun: String(row['사번'] || empId),
          rank: row['직책'] || '매니저',
          registeredClass: null,
          registeredDate: null
        });
      });

      state.centers = Object.values(centerMap);

      // 3) 초기 수강 신청 데이터 채우기 (전체 인원의 약 65%를 무작위 차수에 채워 넣음 - 시뮬레이션 용도)
      state.employees.forEach(emp => {
        if (Math.random() < 0.65) {
          const randClass = 1 + Math.floor(Math.random() * 30);
          const currentCount = state.employees.filter(e => e.region === emp.region && e.registeredClass === randClass).length;
          
          if (currentCount < 60) {
            emp.registeredClass = randClass;
            const rDays = Math.floor(Math.random() * 10);
            emp.registeredDate = `2026-05-${15 + rDays} 10:${String(10 + Math.floor(Math.random() * 49)).padStart(2, '0')}`;
          }
        }
      });

      return state;
    }

    // 5. 로컬스토리지 입출력 및 초기화
    let isInitialLoad = true;

    function loadState() {
      // 사내망 방화벽 등 차단 의심 체크 타이머
      const connectionTimeout = setTimeout(() => {
        if (isInitialLoad) {
          alert('⚠️ 시스템 데이터 연동이 지연되고 있습니다.\n\n원인: LG 사내망(보안 네트워크) 또는 방화벽에서 실시간 데이터베이스(Firebase) 접속을 차단했을 가능성이 높습니다.\n해결: 스마트폰(LTE/5G) 기기나 사외망에서 접속을 테스트해 주세요.');
        }
      }, 5000);

      db.ref('appState').on('value', (snapshot) => {
        clearTimeout(connectionTimeout);
        const data = snapshot.val();
        if (data) {
          appState = data;
          if (!appState.centers) appState.centers = [];
          if (!appState.employees) appState.employees = [];
        } else {
          if (isInitialLoad) {
            appState = generateInitialState();
            saveState();
          }
        }
        
        if (isInitialLoad) {
          isInitialLoad = false;
          updateSimTimeUI();
          checkSession();
        } else {
          updateSimTimeUI();
          if (currentUser) {
            if (currentUser.role === 'admin') {
              renderAdminDashboard();
            } else {
              renderDashboard();
            }
          }
        }
      });
    }

    function saveState() {
      if (db) {
        db.ref('appState').set(appState);
      }
    }

    // 6. 비즈니스 핵심 로직 연산기
    
    // 마감 기한 연산 (시작일 2일 전 00:00:00 자정 기준 마감 여부)
    // 오늘 날짜가 시작일 - 2일 자정보다 크거나 같으면 Locked
    function isClassDateLocked(startDateStr, currentSimTimeStr) {
      const start = new Date(startDateStr);
      
      // 마감일 계산: 시작일로부터 2일 전으로 날짜 차감
      const lockLimit = new Date(start);
      lockLimit.setDate(lockLimit.getDate() - 2);
      lockLimit.setHours(0, 0, 0, 0); // 2일 전 00:00:00 자정
      
      const current = new Date(currentSimTimeStr);
      return current >= lockLimit;
    }

    // 차수별 신청인원 세기
    function getClassEnrollmentCount(region, classNum) {
      return appState.employees.filter(e => e.region === region && e.registeredClass === classNum).length;
    }

    // 차수 상태 진단 ('OPEN' | 'FULL' | 'LOCKED')
    function getClassStatus(region, classNum) {
      const schedule = appState.classSchedules[region].find(s => s.classNum === classNum);
      if (!schedule) return 'LOCKED';
      
      if (isClassDateLocked(schedule.startDate, appState.currentSimTime)) {
        return 'LOCKED';
      }
      
      const count = getClassEnrollmentCount(region, classNum);
      if (count >= 60) {
        return 'FULL';
      }
      
      return 'OPEN';
    }

    // 7. 로그인 / 로그아웃 시스템 (Firebase 연동으로 이벤트 핸들러에서 직접 처리)

    function employeeCounterNext() {
      if (!window.empCounter) {
        window.empCounter = 900000;
      }
      return window.empCounter++;
    }

    // ================= UI 컨트롤러 및 화면 렌더러 =================

    // 엘리먼트 참조 캐싱
    const els = {
      simDateInput: document.getElementById('sim-date-input'),
      btnApplySimDate: document.getElementById('btn-apply-sim-date'),
      btnResetSimDate: document.getElementById('btn-reset-sim-date'),
      currentSimTimeSpan: document.getElementById('current-sim-time'),
      
      loginContainer: document.getElementById('login-container'),
      dashboardContainer: document.getElementById('dashboard-container'),
      loginForm: document.getElementById('login-form'),
      loginName: document.getElementById('login-name'),
      loginSabun: document.getElementById('login-sabun'),
      
      userInitial: document.getElementById('user-initial'),
      userNameTitle: document.getElementById('user-name-title'),
      userCenterTitle: document.getElementById('user-center-title'),
      btnLogout: document.getElementById('btn-logout'),
      
      statCenterTotal: document.getElementById('stat-center-total'),
      statCenterRegistered: document.getElementById('stat-center-registered'),
      statCenterUnregistered: document.getElementById('stat-center-unregistered'),
      statCenterRate: document.getElementById('stat-center-rate'),
      
      managerTableBody: document.getElementById('manager-table-body'),
      sideRegionTitle: document.getElementById('side-region-title'),
      classSummaryContainer: document.getElementById('class-summary-container'),
      
      btnAddManager: document.getElementById('btn-add-manager'),
      btnGotoAdmin: document.getElementById('btn-goto-admin'),
      
      // 모달 엘리먼트들
      modalRegister: document.getElementById('modal-register'),
      regTargetName: document.getElementById('reg-target-name'),
      regTargetSabun: document.getElementById('reg-target-sabun'),
      regTargetRegion: document.getElementById('reg-target-region'),
      regCurrentStatus: document.getElementById('reg-current-status'),
      modalClassGrid: document.getElementById('modal-class-grid'),
      btnSubmitRegistration: document.getElementById('btn-submit-registration'),
      
      modalAddManager: document.getElementById('modal-add-manager'),
      addManagerForm: document.getElementById('add-manager-form'),
      addName: document.getElementById('add-name'),
      addSabun: document.getElementById('add-sabun'),
      addRank: document.getElementById('add-rank'),
      
      modalClassDetails: document.getElementById('modal-class-details'),
      detailClassTitle: document.getElementById('detail-class-title'),
      detailClassDate: document.getElementById('detail-class-date'),
      detailClassCount: document.getElementById('detail-class-count'),
      detailClassStatus: document.getElementById('detail-class-status'),
      detailAttendeeList: document.getElementById('detail-attendee-list'),
      detailEmptyMessage: document.getElementById('detail-empty-message'),
      
      modalAdminAuth: document.getElementById('modal-admin-auth'),
      adminAuthForm: document.getElementById('admin-auth-form'),
      adminPassword: document.getElementById('admin-password'),
      adminAuthError: document.getElementById('admin-auth-error'),
      
      modalAdminPanel: document.getElementById('modal-admin-panel'),
      adminTotalManagers: document.getElementById('admin-total-managers'),
      adminTotalProgress: document.getElementById('admin-total-progress'),
      adminTotalRegLbl: document.getElementById('admin-total-reg-lbl'),
      
      adminMetCount: document.getElementById('admin-met-count'),
      adminMetProgress: document.getElementById('admin-met-progress'),
      adminMetRate: document.getElementById('admin-met-rate'),
      
      adminCenCount: document.getElementById('admin-cen-count'),
      adminCenProgress: document.getElementById('admin-cen-progress'),
      adminCenRate: document.getElementById('admin-cen-rate'),
      
      adminSouCount: document.getElementById('admin-sou-count'),
      adminSouProgress: document.getElementById('admin-sou-progress'),
      adminSouRate: document.getElementById('admin-sou-rate'),
      
      btnAdminResetData: document.getElementById('btn-admin-reset-data'),
      btnExportExcel: document.getElementById('btn-export-excel'),
      
      adminGridMetro: document.getElementById('admin-grid-metro'),
      adminGridCentral: document.getElementById('admin-grid-central'),
      adminGridSouthwest: document.getElementById('admin-grid-southwest')
    };

    // 모달 제어 전역 매개변수
    let activeRegisteringEmployee = null; // 현재 수강신청을 수정/등록 중인 매니저 객체
    let selectedRegistrationClassNum = null; // 신청 모달에서 선택한 신규 차수 번호

    // 초기화 함수
    function init() {
      bindEvents();
      loadState();
    }

    // 8. 세션 및 날짜 시뮬레이터 동기화
    function checkSession() {
      const savedSession = sessionStorage.getItem('LGE_REG_SESSION');
      if (savedSession) {
        currentUser = JSON.parse(savedSession);
        
        if (currentUser.role !== 'admin') {
          db.ref('centerLocks/' + currentUser.centerId).set(true);
          db.ref('centerLocks/' + currentUser.centerId).onDisconnect().remove();
          showPage('dashboard-container');
          renderDashboard();
        } else {
          showPage('admin-container');
          renderAdminDashboard();
        }
      } else {
        showPage('login-container');
      }
    }

    function showPage(pageId) {
      document.querySelectorAll('.page-container').forEach(p => {
        p.classList.remove('active-page');
      });
      const target = document.getElementById(pageId);
      if (target) {
        target.classList.add('active-page');
      }
    }

    function updateSimTimeUI() {
      const formatted = appState.currentSimTime.replace('T', ' ');
      els.currentSimTimeSpan.innerText = formatted;
      els.simDateInput.value = appState.currentSimTime;
    }

    // 9. 대시보드 렌더링 엔진
    function renderDashboard() {
      if (!currentUser) return;

      // 헤더 프로필 셋팅
      els.userInitial.innerText = currentUser.name.charAt(0);
      els.userNameTitle.innerText = `${currentUser.name} ${currentUser.role}`;
      els.userCenterTitle.innerText = `${currentUser.region} · ${currentUser.centerName}`;

      // 센터 구성원 데이터 계산
      const centerEmployees = appState.employees.filter(e => e.centerId === currentUser.centerId);
      const total = centerEmployees.length;
      const registered = centerEmployees.filter(e => e.registeredClass !== null).length;
      const unregistered = total - registered;
      const rate = total > 0 ? ((registered / total) * 100).toFixed(1) : '0.0';

      els.statCenterTotal.innerText = `${total}명`;
      els.statCenterRegistered.innerText = `${registered}명`;
      els.statCenterUnregistered.innerText = `${unregistered}명`;
      els.statCenterRate.innerText = `${rate}%`;

      // 테이블 렌더링
      renderEmployeeTable(centerEmployees);

      // 우측 차수 현황판 렌더링
      els.sideRegionTitle.innerText = currentUser.region;
      renderSideClassSummary();
    }

    // 10. 센터 구성원 목록 테이블 렌더링
    function renderEmployeeTable(employees) {
      els.managerTableBody.innerHTML = '';
      
      if (employees.length === 0) {
        els.managerTableBody.innerHTML = `<tr><td colspan="7" class="empty-table-msg" style="text-align:center; padding: 40px; color: var(--slate-400);">센터 소속 매니저가 존재하지 않습니다.</td></tr>`;
        return;
      }

      // 이름 오름차순 정렬
      employees.sort((a, b) => a.name.localeCompare(b.name));

      employees.forEach(emp => {
        const tr = document.createElement('tr');
        
        // 신청 정보 추출
        let statusBadgeHtml = '';
        let classText = '-';
        let periodText = '-';
        let actionButtonsHtml = '';

        if (emp.registeredClass === null) {
          statusBadgeHtml = `<span class="status-badge orange">미신청</span>`;
          actionButtonsHtml = `<button class="btn-table-action primary btn-act-register" data-sabun="${emp.sabun}">수강신청</button>`;
        } else {
          const schedule = appState.classSchedules[emp.region].find(s => s.classNum === emp.registeredClass);
          const startDate = schedule ? schedule.startDate : '';
          const endDate = schedule ? schedule.endDate : '';
          
          // 차수가 현재 마감되었는지 계산
          const isLocked = schedule ? isClassDateLocked(startDate, appState.currentSimTime) : false;
          
          classText = `${emp.registeredClass}차수`;
          periodText = schedule ? `${startDate} ~ ${endDate}` : '-';

          if (isLocked) {
            statusBadgeHtml = `<span class="status-badge gray">🔒 교육마감</span>`;
            // 교육 마감된 차수는 변경/취소 버튼 차단 (안내 문구)
            actionButtonsHtml = `<span class="locked-text" style="font-size: 11px; color: var(--slate-400); font-weight: 500;">🚫 변경불가 (기한만료)</span>`;
          } else {
            statusBadgeHtml = `<span class="status-badge green">신청완료</span>`;
            actionButtonsHtml = `
              <div class="action-btn-group">
                <button class="btn-table-action btn-act-register" data-sabun="${emp.sabun}">차수변경</button>
                <button class="btn-table-action danger btn-act-cancel" data-sabun="${emp.sabun}">취소</button>
              </div>
            `;
          }
        }

        tr.innerHTML = `
          <td class="font-semibold" style="color: var(--slate-900); font-weight:700;">${emp.name}</td>
          <td class="font-sabun">${emp.sabun}</td>
          <td>${emp.rank}</td>
          <td>${statusBadgeHtml}</td>
          <td class="font-semibold" style="color: var(--lg-red);">${classText}</td>
          <td class="font-sabun" style="font-size:12.5px;">${periodText}</td>
          <td>${actionButtonsHtml}</td>
        `;

        els.managerTableBody.appendChild(tr);
      });

      // 이벤트 리바인딩
      document.querySelectorAll('.btn-act-register').forEach(btn => {
        btn.addEventListener('click', function () {
          const sabun = this.getAttribute('data-sabun');
          openRegisterModal(sabun);
        });
      });

      document.querySelectorAll('.btn-act-cancel').forEach(btn => {
        btn.addEventListener('click', function () {
          const sabun = this.getAttribute('data-sabun');
          handleCancelRegistration(sabun);
        });
      });
    }

    // 11. 우측 1~30차수 실시간 종합 현황판 렌더링
    function renderSideClassSummary() {
      if (!currentUser) return;
      const region = currentUser.region;
      const classes = appState.classSchedules[region];

      els.classSummaryContainer.innerHTML = '';

      classes.forEach(cls => {
        const count = getClassEnrollmentCount(region, cls.classNum);
        const percent = Math.min(100, ((count / 60) * 100));
        const status = getClassStatus(region, cls.classNum);
        
        const card = document.createElement('div');
        card.className = 'class-summary-card';

        let statusBadge = '';
        let fillClass = '';
        
        if (status === 'LOCKED') {
          statusBadge = `<span class="status-badge gray" style="font-size: 10px; padding: 2px 6px;">🔒 마감</span>`;
          fillClass = 'class="csc-progressfill full"';
        } else if (status === 'FULL') {
          statusBadge = `<span class="status-badge red" style="font-size: 10px; padding: 2px 6px;">정원마감</span>`;
          fillClass = 'class="csc-progressfill full"';
        } else {
          statusBadge = `<span class="status-badge green" style="font-size: 10px; padding: 2px 6px;">신청가능</span>`;
          fillClass = 'class="csc-progressfill"';
        }

        card.innerHTML = `
          <div class="csc-header">
            <span class="csc-title">${cls.classNum}차수</span>
            <span class="csc-ratio"><span class="filled">${count}</span> / 60명</span>
          </div>
          <div class="csc-progressbar">
            <div ${fillClass} style="width: ${percent}%"></div>
          </div>
          <div class="csc-footer">
            <span class="csc-date">📅 ${cls.startDate} ~ ${cls.endDate}</span>
            <div style="display:flex; align-items:center; gap:8px;">
              ${statusBadge}
              <button class="btn-view-attendees" data-region="${region}" data-class="${cls.classNum}">신청자 보기</button>
            </div>
          </div>
        `;

        els.classSummaryContainer.appendChild(card);
      });

      // 신청자 보기 버튼 바인딩
      document.querySelectorAll('.btn-view-attendees').forEach(btn => {
        btn.addEventListener('click', function () {
          const reg = this.getAttribute('data-region');
          const cNum = parseInt(this.getAttribute('data-class'));
          openClassDetailsModal(reg, cNum);
        });
      });
    }

    // 12. 수강신청 / 변경 모달 제어
    function openRegisterModal(sabun) {
      const emp = appState.employees.find(e => e.sabun === sabun);
      if (!emp) return;

      activeRegisteringEmployee = emp;
      selectedRegistrationClassNum = null;

      // 모달 상단 헤더정보 바인딩
      els.regTargetName.innerText = emp.name;
      els.regTargetSabun.innerText = emp.sabun;
      els.regTargetRegion.innerText = emp.region;
      
      if (emp.registeredClass) {
        els.regCurrentStatus.className = 'status-badge blue';
        els.regCurrentStatus.innerText = `${emp.registeredClass}차수 수강중`;
        els.btnSubmitRegistration.innerText = '수강 변경 완료';
      } else {
        els.regCurrentStatus.className = 'status-badge orange';
        els.regCurrentStatus.innerText = '미신청';
        els.btnSubmitRegistration.innerText = '수강 신청 완료';
      }

      // 신청 불가능 버튼 활성화 해제
      els.btnSubmitRegistration.disabled = true;

      // 해당 지역의 1~30차수 리스트 렌더링
      const region = emp.region;
      const classes = appState.classSchedules[region];
      els.modalClassGrid.innerHTML = '';

      classes.forEach(cls => {
        const count = getClassEnrollmentCount(region, cls.classNum);
        const isEnrolledInThis = emp.registeredClass === cls.classNum;
        
        // 상태 구하기
        const isDateLocked = isClassDateLocked(cls.startDate, appState.currentSimTime);
        const isFull = count >= 60;
        
        const card = document.createElement('div');
        card.className = 'class-select-card';
        
        // CSS 상태 지정
        if (isDateLocked) {
          card.classList.add('locked');
        } else if (isFull && !isEnrolledInThis) {
          card.classList.add('full');
        }

        if (isEnrolledInThis) {
          card.classList.add('selected');
          // 현재 수강중인 곳이면 상태에 상관없이 선택 처리
          card.innerHTML += `<span class="csc-badge-top current">현재선택</span>`;
        }

        card.innerHTML += `
          <span class="card-class-num">${cls.classNum}차수</span>
          <span class="card-class-date">${cls.startDate.substring(5)}</span>
          <span class="card-class-spots">정원: <span>${count} / 60</span></span>
        `;

        // 선택 가능 클릭 이벤트
        if (!isDateLocked && (!isFull || isEnrolledInThis)) {
          card.addEventListener('click', function () {
            // 기존 선택 해제
            document.querySelectorAll('.class-select-card').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            
            selectedRegistrationClassNum = cls.classNum;
            
            // 현재와 다른 차수를 선택한 경우에만 완료버튼 활성화
            if (emp.registeredClass === cls.classNum) {
              els.btnSubmitRegistration.disabled = true;
            } else {
              els.btnSubmitRegistration.disabled = false;
            }
          });
        }

        els.modalClassGrid.appendChild(card);
      });

      openModal('modal-register');
    }

    function handleAddRegistrationSubmit() {
      if (!activeRegisteringEmployee || !selectedRegistrationClassNum) return;

      const emp = activeRegisteringEmployee;
      const targetClassNum = selectedRegistrationClassNum;
      const region = emp.region;

      // 검증 로직 재차 체크
      const status = getClassStatus(region, targetClassNum);
      if (status === 'LOCKED') {
        alert('⚠️ 해당 차수는 교육 시작 2일 전으로 수강신청이 마감되었습니다.');
        return;
      }
      if (status === 'FULL') {
        alert('⚠️ 해당 차수는 이미 정원(60명)이 만료되었습니다.');
        return;
      }

      // 기존 등록 차수가 있었다면, 그 차수가 마감된 차수인지 확인 (마감 차수의 매니저는 변경 불가)
      if (emp.registeredClass) {
        const oldSchedule = appState.classSchedules[region].find(s => s.classNum === emp.registeredClass);
        if (oldSchedule && isClassDateLocked(oldSchedule.startDate, appState.currentSimTime)) {
          alert('⚠️ 기존에 소속되었던 차수가 교육 시작 2일 전 범위에 있어 변경할 수 없습니다.');
          return;
        }
      }

      // 신청 처리
      const now = new Date(appState.currentSimTime);
      const dateStr = formatDate(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

      emp.registeredClass = targetClassNum;
      emp.registeredDate = dateStr;

      saveState();
      closeModal('modal-register');
      renderDashboard();
      
      alert(`🎉 [${emp.name} 매니저] 수강신청이 성공적으로 완료되었습니다! (${targetClassNum}차수)`);
    }

    function handleCancelRegistration(sabun) {
      const emp = appState.employees.find(e => e.sabun === sabun);
      if (!emp || emp.registeredClass === null) return;

      const schedule = appState.classSchedules[emp.region].find(s => s.classNum === emp.registeredClass);
      if (schedule && isClassDateLocked(schedule.startDate, appState.currentSimTime)) {
        alert('⚠️ 교육 시작 2일 전 마감 상태이므로, 수강신청 취소가 불가능합니다.');
        return;
      }

      if (confirm(`정말로 [${emp.name} 매니저]의 ${emp.registeredClass}차수 수강신청을 취소하시겠습니까?`)) {
        emp.registeredClass = null;
        emp.registeredDate = null;
        
        saveState();
        renderDashboard();
        alert('수강신청이 취소되었습니다.');
      }
    }

    // 13. 차수별 상세 수강생 명단 모달 (어느센터 누가 수강신청 되어 있는지 상세 보기)
    function openClassDetailsModal(region, classNum) {
      const schedule = appState.classSchedules[region].find(s => s.classNum === classNum);
      if (!schedule) return;

      els.detailClassTitle.innerText = `${region} - ${classNum}차수`;
      els.detailClassDate.innerText = `📅 ${schedule.startDate} ~ ${schedule.endDate}`;
      
      const count = getClassEnrollmentCount(region, classNum);
      els.detailClassCount.innerText = `${count} / 60명`;

      const status = getClassStatus(region, classNum);
      if (status === 'LOCKED') {
        els.detailClassStatus.className = 'status-badge gray';
        els.detailClassStatus.innerText = '🔒 기간마감';
      } else if (status === 'FULL') {
        els.detailClassStatus.className = 'status-badge red';
        els.detailClassStatus.innerText = '🚫 정원마감';
      } else {
        els.detailClassStatus.className = 'status-badge green';
        els.detailClassStatus.innerText = '신청가능';
      }

      // 해당 차수 수강생 필터링
      const enrolledManagers = appState.employees.filter(e => e.region === region && e.registeredClass === classNum);
      
      // 센터 및 이름 오름차순 정렬
      enrolledManagers.sort((a, b) => {
        const cA = getCenterName(a.centerId);
        const cB = getCenterName(b.centerId);
        if (cA !== cB) return cA.localeCompare(cB);
        return a.name.localeCompare(b.name);
      });

      els.detailAttendeeList.innerHTML = '';
      
      if (enrolledManagers.length === 0) {
        els.detailEmptyMessage.style.display = 'block';
      } else {
        els.detailEmptyMessage.style.display = 'none';
        
        enrolledManagers.forEach((m, idx) => {
          const centerName = getCenterName(m.centerId);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="font-sabun">${idx + 1}</td>
            <td>${m.region}</td>
            <td class="font-semibold" style="color: var(--slate-900);">${centerName}</td>
            <td class="font-sabun">${m.sabun}</td>
            <td class="font-semibold" style="color: var(--lg-red);">${m.name}</td>
            <td>${m.rank}</td>
            <td class="font-sabun" style="font-size: 11.5px;">${m.registeredDate || '-'}</td>
          `;
          els.detailAttendeeList.appendChild(tr);
        });
      }

      openModal('modal-class-details');
    }

    function getCenterName(centerId) {
      const center = appState.centers.find(c => c.id === centerId);
      return center ? center.name : '알수없음';
    }

    // 14. 관리자 모달 및 패스워드 인증
    function handleAdminAuthSubmit(e) {
      e.preventDefault();
      const pw = els.adminPassword.value;
      if (pw === '2026') {
        closeModal('modal-admin-auth');
        els.adminPassword.value = '';
        els.adminAuthError.style.display = 'none';
        openAdminPanel();
      } else {
        els.adminAuthError.style.display = 'block';
      }
    }

    // 15. 아카데미 전체 종합 관리자 콘솔 오픈
    function openAdminPanel() {
      renderAdminDashboard();
      openModal('modal-admin-panel');
    }

    // 관리자 대시보드 데이터 연산 및 렌더링
    function renderAdminDashboard() {
      const total = appState.employees.length;
      const registered = appState.employees.filter(e => e.registeredClass !== null).length;
      const overallRate = total > 0 ? ((registered / total) * 100).toFixed(1) : '0.0';

      // 전사 종합 지표 바인딩
      els.adminTotalManagers.innerText = `${formatNumber(total)}명`;
      els.adminTotalProgress.style.width = `${overallRate}%`;
      els.adminTotalRegLbl.innerText = `총 ${formatNumber(registered)}명 신청 완료 (${overallRate}%)`;

      // 1. 수도권 지역 현황
      const metAll = appState.employees.filter(e => e.region === '수도권');
      const metReg = metAll.filter(e => e.registeredClass !== null).length;
      const metRate = metAll.length > 0 ? ((metReg / metAll.length) * 100).toFixed(1) : '0.0';
      els.adminMetCount.innerText = `${formatNumber(metReg)} / ${formatNumber(metAll.length)}명`;
      els.adminMetProgress.style.width = `${metRate}%`;
      els.adminMetRate.innerText = `${metRate}%`;

      // 2. 중부/강원실 지역 현황
      const cenAll = appState.employees.filter(e => e.region === '중부/강원실');
      const cenReg = cenAll.filter(e => e.registeredClass !== null).length;
      const cenRate = cenAll.length > 0 ? ((cenReg / cenAll.length) * 100).toFixed(1) : '0.0';
      els.adminCenCount.innerText = `${formatNumber(cenReg)} / ${formatNumber(cenAll.length)}명`;
      els.adminCenProgress.style.width = `${cenRate}%`;
      els.adminCenRate.innerText = `${cenRate}%`;

      // 3. 서남부/충청실 지역 현황
      const souAll = appState.employees.filter(e => e.region === '서남부/충청실');
      const souReg = souAll.filter(e => e.registeredClass !== null).length;
      const souRate = souAll.length > 0 ? ((souReg / souAll.length) * 100).toFixed(1) : '0.0';
      els.adminSouCount.innerText = `${formatNumber(souReg)} / ${formatNumber(souAll.length)}명`;
      els.adminSouProgress.style.width = `${souRate}%`;
      els.adminSouRate.innerText = `${souRate}%`;

      // 각 지역별 1~30차수 상세 카드 목록 렌더링
      renderAdminRegionGrid('수도권', els.adminGridMetro);
      renderAdminRegionGrid('중부/강원실', els.adminGridCentral);
      renderAdminRegionGrid('서남부/충청실', els.adminGridSouthwest);
    }

    function formatNumber(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // 관리자 차수 카드 그리드 렌더링 (일정 에디터 & 신청 명단 한눈에 보기)
    function renderAdminRegionGrid(region, container) {
      container.innerHTML = '';
      const classes = appState.classSchedules[region];

      classes.forEach(cls => {
        const enrolled = appState.employees.filter(e => e.region === region && e.registeredClass === cls.classNum);
        const count = enrolled.length;
        const percent = Math.min(100, ((count / 60) * 100));
        const status = getClassStatus(region, cls.classNum);

        const card = document.createElement('div');
        card.className = 'admin-class-card';

        let statusBadge = '';
        let barClass = '';

        if (status === 'LOCKED') {
          statusBadge = `<span class="status-badge gray" style="font-size:10px; padding:2px 6px;">🔒 기간마감</span>`;
          barClass = 'class="acc-progress-fill full"';
        } else if (status === 'FULL') {
          statusBadge = `<span class="status-badge red" style="font-size:10px; padding:2px 6px;">🚫 정원초과</span>`;
          barClass = 'class="acc-progress-fill full"';
        } else {
          statusBadge = `<span class="status-badge green" style="font-size:10px; padding:2px 6px;">신청가능</span>`;
          barClass = 'class="acc-progress-fill"';
        }

        // 수강생 미니 태그 리스트 생성 (어느 센터 누가 신청했는지 한눈에 파악)
        let tagsHtml = '';
        if (enrolled.length === 0) {
          tagsHtml = `<div class="acc-empty">신청자 없음</div>`;
        } else {
          enrolled.sort((a, b) => getCenterName(a.centerId).localeCompare(getCenterName(b.centerId)));
          
          enrolled.forEach(emp => {
            const cName = getCenterName(emp.centerId).replace('센터', '');
            tagsHtml += `<span class="acc-attendee-tag">${cName} · <strong>${emp.name}</strong></span>`;
          });
        }

        card.innerHTML = `
          <div class="acc-header">
            <div>
              <div class="acc-title">${cls.classNum}차수</div>
              <div style="margin-top: 4px;">${statusBadge}</div>
            </div>
            <div class="acc-date-edit">
              <label>교육 시작일 변경</label>
              <input type="date" class="admin-input-class-date" data-region="${region}" data-class="${cls.classNum}" value="${cls.startDate}">
            </div>
          </div>

          <div class="acc-stats">
            <span>신청 인원</span>
            <span class="filled-cnt">${count} / 60명</span>
          </div>
          <div class="acc-progress-container">
            <div ${barClass} style="width: ${percent}%"></div>
          </div>

          <div class="acc-attendee-area">
            <div class="acc-attendee-title">수강 신청자 명단 (${count}명)</div>
            <div class="acc-attendee-list-mini">
              ${tagsHtml}
            </div>
            <button class="btn-acc-download btn-csv-class-export" data-region="${region}" data-class="${cls.classNum}">
              📥 이 차수 명단 엑셀 다운로드
            </button>
          </div>
        `;

        container.appendChild(card);
      });

      // 시작일자 강제 편집 이벤트 리스너 바인딩 (2일 전 마감 룰 테스트용)
      container.querySelectorAll('.admin-input-class-date').forEach(input => {
        input.addEventListener('change', function () {
          const reg = this.getAttribute('data-region');
          const cNum = parseInt(this.getAttribute('data-class'));
          const newStartStr = this.value;
          
          if (!newStartStr) return;

          // 끝나는 날짜는 5일 주말교육 모사 (+4일)
          const start = new Date(newStartStr);
          const end = new Date(start);
          end.setDate(end.getDate() + 4);

          const target = appState.classSchedules[reg].find(s => s.classNum === cNum);
          if (target) {
            target.startDate = newStartStr;
            target.endDate = formatDate(end);
            
            saveState();
            renderAdminDashboard();
            renderDashboard(); // 뒤쪽 대시보드도 동시 갱신
            console.log(`Updated class date for ${reg} ${cNum}차수: ${newStartStr}`);
          }
        });
      });

      // 차수별 명단 다운로드 이벤트 바인딩
      container.querySelectorAll('.btn-csv-class-export').forEach(btn => {
        btn.addEventListener('click', function () {
          const reg = this.getAttribute('data-region');
          const cNum = parseInt(this.getAttribute('data-class'));
          exportClassToCSV(reg, cNum);
        });
      });
    }

    // 16. CSV 엑셀 다운로드 엔진 (UTF-8 BOM 주입으로 한글 깨짐 원천 방지)
    function exportClassToCSV(region, classNum) {
      const schedule = appState.classSchedules[region].find(s => s.classNum === classNum);
      if (!schedule) return;

      const enrolled = appState.employees.filter(e => e.region === region && e.registeredClass === classNum);
      
      // 헤더 정의
      let csvContent = "순번,지역담당,센터명,사번,성명,직급,신청차수,교육 시작일,교육 종료일,신청일시\n";
      
      if (enrolled.length === 0) {
        csvContent += "신청자 없음,,,,,,\n";
      } else {
        enrolled.sort((a, b) => getCenterName(a.centerId).localeCompare(getCenterName(b.centerId)));
        enrolled.forEach((emp, index) => {
          const centerName = getCenterName(emp.centerId);
          csvContent += `${index + 1},${emp.region},${centerName},${emp.sabun},${emp.name},${emp.rank},${emp.registeredClass}차수,${schedule.startDate},${schedule.endDate},${emp.registeredDate || '-'}\n`;
        });
      }

      // 다운로드 실행
      triggerCSVDownload(`${region.replace('/', '_')}_${classNum}차수_수강명단.csv`, csvContent);
    }

    function exportAllToCSV(filterRegion = null) {
      let filename = '전사_서비스매니저_전사원과정_수강신청명단.csv';
      let filteredEmployees = appState.employees.filter(e => e.registeredClass !== null);

      if (filterRegion) {
        filteredEmployees = filteredEmployees.filter(e => e.region === filterRegion);
        filename = `${filterRegion.replace('/', '_')}_서비스매니저_수강신청명단.csv`;
      }

      // 정렬: 지역, 차수, 센터, 이름 순
      filteredEmployees.sort((a, b) => {
        if (a.region !== b.region) return a.region.localeCompare(b.region);
        if (a.registeredClass !== b.registeredClass) return a.registeredClass - b.registeredClass;
        const cA = getCenterName(a.centerId);
        const cB = getCenterName(b.centerId);
        if (cA !== cB) return cA.localeCompare(cB);
        return a.name.localeCompare(b.name);
      });

      let csvContent = "순번,지역담당,센터명,사번,성명,직급,신청차수,교육 시작일,교육 종료일,신청일시\n";

      if (filteredEmployees.length === 0) {
        csvContent += "등록된 수강 신청자가 없습니다.,,,,,,\n";
      } else {
        filteredEmployees.forEach((emp, index) => {
          const centerName = getCenterName(emp.centerId);
          const schedule = appState.classSchedules[emp.region].find(s => s.classNum === emp.registeredClass);
          const start = schedule ? schedule.startDate : '';
          const end = schedule ? schedule.endDate : '';
          csvContent += `${index + 1},${emp.region},${centerName},${emp.sabun},${emp.name},${emp.rank},${emp.registeredClass}차수,${start},${end},${emp.registeredDate || '-'}\n`;
        });
      }

      triggerCSVDownload(filename, csvContent);
    }

    function triggerCSVDownload(filename, content) {
      // UTF-8 인코딩에서 엑셀이 한글을 인식할 수 있도록 BOM(\uFEFF)을 선두에 주입합니다.
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8;' });
      
      if (navigator.msSaveBlob) { // IE 호환성
        navigator.msSaveBlob(blob, filename);
      } else {
        const link = document.createElement("a");
        if (link.download !== undefined) {
          const url = URL.createObjectURL(blob);
          link.setAttribute("href", url);
          link.setAttribute("download", filename);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    }

    // 17. 공통 모달 온오프 도구
    function openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('active-modal');
      }
    }

    function closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('active-modal');
      }
    }

    // 18. 이벤트 바인딩 마스터
    function bindEvents() {
      // 로그인 처리
      els.loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (isInitialLoad) {
          alert('시스템 데이터를 연동 중입니다. 약 1~3초 후 다시 시도해주세요.');
          return;
        }
        
        const name = els.loginName.value.trim();
        const sabun = els.loginSabun.value.trim();

        // 관리자 체크
        if (name === '어드민' && sabun === '9999') {
          currentUser = { role: 'admin', name: '어드민', sabun: '9999' };
          sessionStorage.setItem('LGE_REG_SESSION', JSON.stringify(currentUser));
          els.loginForm.reset();
          showPage('admin-container');
          renderAdminDashboard();
          return;
        }

        let matchedCenter = appState.centers.find(c => 
          ((c.leaderName || '').trim() === name && (c.leaderSabun || '').trim() === sabun) || 
          ((c.managerName || '').trim() === name && (c.managerSabun || '').trim() === sabun)
        );

        if (!matchedCenter) {
          alert('일치하는 센터장 또는 실장 정보가 없습니다.\\n이름과 사번을 올바르게 입력해주세요.');
          return;
        }

        // 센터 락 체크
        db.ref('centerLocks/' + matchedCenter.id).once('value').then(snap => {
          if (snap.val() === true) {
            alert('현재 해당 센터의 다른 관리자가 접속 중입니다. (중복 로그인 방지)');
            return;
          }

          // 락 걸기
          db.ref('centerLocks/' + matchedCenter.id).set(true);
          db.ref('centerLocks/' + matchedCenter.id).onDisconnect().remove();

          const isLeader = matchedCenter.leaderSabun === sabun;
          currentUser = {
            name: name,
            sabun: sabun,
            role: isLeader ? '센터장' : '실장',
            centerId: matchedCenter.id,
            centerName: matchedCenter.name,
            region: matchedCenter.region
          };

          sessionStorage.setItem('LGE_REG_SESSION', JSON.stringify(currentUser));
          els.loginName.value = '';
          els.loginSabun.value = '';
          showPage('dashboard-container');
          renderDashboard();
        });
      });

      // 로그아웃
      els.btnLogout.addEventListener('click', function () {
        if (confirm('정말로 로그아웃 하시겠습니까?')) {
          if (currentUser && currentUser.role !== 'admin') {
            db.ref('centerLocks/' + currentUser.centerId).remove();
          }
          sessionStorage.removeItem('LGE_REG_SESSION');
          currentUser = null;
          showPage('login-container');
        }
      });

      // 모달 공통 닫기 버튼 바인딩
      document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
          // 부모 모달 오버레이 찾기
          const overlay = this.closest('.modal-overlay');
          if (overlay) {
            overlay.classList.remove('active-modal');
          }
        });
      });

      // 수강신청 제출 버튼
      els.btnSubmitRegistration.addEventListener('click', handleAddRegistrationSubmit);

      // 센터내 신규 구성원 수동 추가
      els.btnAddManager.addEventListener('click', () => {
        els.addManagerForm.reset();
        openModal('modal-add-manager');
      });

      els.addManagerForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!currentUser) return;

        const name = els.addName.value.trim();
        const sabun = els.addSabun.value.trim();
        const rank = els.addRank.value;

        // 사번 중복 확인
        const duplicate = appState.employees.find(emp => emp.sabun === sabun);
        if (duplicate) {
          alert('⚠️ 이미 등록되어 있는 사번입니다. 다른 사번을 입력해 주세요.');
          return;
        }

        // 등록
        appState.employees.push({
          id: appState.employees.length + 100000,
          centerId: currentUser.centerId,
          region: currentUser.region,
          name: name,
          sabun: sabun,
          rank: rank,
          registeredClass: null,
          registeredDate: null
        });

        saveState();
        closeModal('modal-add-manager');
        renderDashboard();
        
        alert(`🎉 [${name} 매니저]가 성공적으로 우리 센터의 명단에 추가되었습니다.`);
      });

      // 날짜 시뮬레이터 적용 버튼
      els.btnApplySimDate.addEventListener('click', () => {
        const newSim = els.simDateInput.value;
        if (!newSim) return;
        
        appState.currentSimTime = newSim;
        saveState();
        updateSimTimeUI();
        
        // 화면 전체 갱신 (마감 상태가 즉석 변경됨)
        if (currentUser) {
          renderDashboard();
        }
        
        // 관리자 화면이 열려 있다면 갱신
        if (els.modalAdminPanel.classList.contains('active-modal')) {
          renderAdminDashboard();
        }

        alert(`⏰ 가상 날짜가 성공적으로 변경되었습니다.\n${newSim.replace('T', ' ')} 기준으로 정원 및 마감 상태가 재계산됩니다.`);
      });

      // 날짜 시뮬레이터 리셋
      els.btnResetSimDate.addEventListener('click', () => {
        const now = new Date();
        // YYYY-MM-DDTHH:MM 포맷팅
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        
        const defaultTime = `${y}-${m}-${d}T${h}:${min}`;
        
        appState.currentSimTime = defaultTime;
        saveState();
        updateSimTimeUI();
        
        if (currentUser) {
          renderDashboard();
        }
        if (els.modalAdminPanel.classList.contains('active-modal')) {
          renderAdminDashboard();
        }

        alert('⏰ 시스템 시각이 현재 실제 시각으로 리셋되었습니다.');
      });

      // 관리자 진입 인증 폼 제출
      els.btnGotoAdmin.addEventListener('click', () => {
        els.adminPassword.value = '';
        els.adminAuthError.style.display = 'none';
        openModal('modal-admin-auth');
      });

      els.adminAuthForm.addEventListener('submit', handleAdminAuthSubmit);

      // 관리자 종합 CSV 다운로드
      els.btnExportExcel.addEventListener('click', () => {
        exportAllToCSV();
      });

      // 관리자 단일지역 CSV 다운로드
      document.querySelectorAll('.btn-export-region-excel').forEach(btn => {
        btn.addEventListener('click', function () {
          const reg = this.getAttribute('data-region');
          exportAllToCSV(reg);
        });
      });

      // 관리자 탭 전환 제어
      document.querySelectorAll('.region-tabs-container .tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          // 버튼 액티브 클래스 부여
          document.querySelectorAll('.region-tabs-container .tab-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');

          const tabId = this.getAttribute('data-tab');
          
          if (tabId === 'tab-all-regions') {
            // 전체 지역 노출
            document.querySelectorAll('.region-content-section').forEach(sec => sec.classList.add('active-section'));
          } else {
            // 개별 지역 노출
            document.querySelectorAll('.region-content-section').forEach(sec => sec.classList.remove('active-section'));
            if (tabId === 'tab-metro') {
              document.getElementById('admin-panel-region-metro').classList.add('active-section');
            } else if (tabId === 'tab-central') {
              document.getElementById('admin-panel-region-central').classList.add('active-section');
            } else if (tabId === 'tab-southwest') {
              document.getElementById('admin-panel-region-southwest').classList.add('active-section');
            }
          }
        });
      });

      // 관리자 데이터 초기화
      els.btnAdminResetData.addEventListener('click', () => {
        if (confirm('🚨 주의: 모든 수강신청 정보와 임의 수정한 차수 일정이 영구 삭제되고 초기화됩니다. 계속하시겠습니까?')) {
          appState = generateInitialState();
          saveState();
          closeModal('modal-admin-panel');
          
          if (currentUser) {
            // 세션 재검증
            const stillExists = appState.centers.some(c => c.id === currentUser.centerId);
            if (stillExists) {
              renderDashboard();
            } else {
              sessionStorage.removeItem('LGE_REG_SESSION');
              currentUser = null;
              showPage('login-container');
            }
          }
          alert('데이터베이스가 공장 출하 초기 모사 상태로 복구되었습니다.');
        }
      });
    }

    // 19. 실행 시작
    init();
  } catch (err) {
    alert("🚨 app.js 내부 오류 발생\n내용: " + err.message + "\n" + err.stack);
  }
})();

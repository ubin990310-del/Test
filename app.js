/* ==========================================================================
   LG Service Manager Registration System - Application Engine
   ========================================================================== */

(function () {
  try {


    // 1. ?�태 객체 ?�의 (?�이?�는 Firebase ?�시�?DB??보존)
    const STATE_KEY = 'LGE_REGISTRATION_SYSTEM_STATE_V2';
    let appState = {
      centers: [],       // ?�터 목록
      employees: [],     // ?�사 구성??리스??      classSchedules: {},// 지??�� 30�?차수 ?�정
      currentSimTime: '2026-05-27T17:10:00' // 가???�스???�각 (기본�?
    };

    let currentUser = null; // ?�재 로그?�된 ?�션 [{ name, sabun, role, centerId, region }]

    // 2. 가???�이???�성???�한 ?�틸리티
    const REGIONS = ['?�도�?, '중�?/강원??, '?�남부/충청??];
    const RANKS = ['매니?�', '?�임 매니?�', '책임 매니?�'];
    
    const LAST_NAMES = ['김', '??, '�?, '�?, '??, '�?, '�?, '??, '??, '??, '??, '??, '??, '??, '�?, '??, '??, '??, '??, '??];
    const FIRST_NAMES = [
      '민수', '?��?', '?��?', '?�윤', '?�우', '주원', '?��?', '지??, '지�?, '준??, 
      '지??, '지??, '?�아', '?��?', '?��?', '?�아', '?�현', '지??, '?�율', '채원',
      '?�우', '건우', '?�진', '?�우', '?�현', '?�윤', '?�연', '민재', '?�우', '?�진'
    ];

    function generateRandomName() {
      const ln = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
      const fn = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      return ln + fn;
    }

    // 3. 차수�?기본 ?�짜 리스???�성 (2026??6??1?��???매주 ?�요??개강)
    function generateDefaultClassDates() {
      const schedules = {};
      REGIONS.forEach(region => {
        schedules[region] = [];
        let baseDate = new Date('2026-06-01'); // 1차수 ?�작??        
        for (let i = 1; i <= 30; i++) {
          // 주말 ?�외 5??교육
          const start = new Date(baseDate);
          const end = new Date(baseDate);
          end.setDate(end.getDate() + 4); // ??�?          
          schedules[region].push({
            classNum: i,
            startDate: formatDate(start),
            endDate: formatDate(end)
          });
          
          // ?�음 차수??1주일 ???�작
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

    // 4. 초기 가??마스???�이???�성 모듈 (?�제 ?�이???�동)
    function generateInitialState() {
      console.log("Generating initial database from INITIAL_DATA...");
      const state = {
        centers: [],
        employees: [],
        classSchedules: generateDefaultClassDates(),
        currentSimTime: '2026-05-27T17:10:00'
      };

      function mapRegion(rawRegion) {
        if (!rawRegion) return '?�도�?;
        if (rawRegion.includes('?�도�?)) return '?�도�?;
        if (rawRegion.includes('강원') || rawRegion.includes('중�?')) return '중�?/강원??;
        if (rawRegion.includes('?�남부') || rawRegion.includes('충청')) return '?�남부/충청??;
        return '?�도�?; // 기본�?      }

      let centerIdCounter = 1;
      let employeeIdCounter = 100000;

      const adminData = (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA['로그?�계???�보']) ? INITIAL_DATA['로그?�계???�보'] : [];
      const memberData = (typeof INITIAL_DATA !== 'undefined' && INITIAL_DATA['?�터 구성???�보']) ? INITIAL_DATA['?�터 구성???�보'] : [];

      const centerMap = {};

      // 1) ?�터???�장 ?�이?�로 ?�터 기본 ?�보 구축
      adminData.forEach(row => {
        const centerName = row['?�터�?] || '미�??�센??;
        const region = mapRegion(row['?�당/??]);
        
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
          c.leaderName = row['?�명'];
          c.leaderSabun = String(row['?�번']);
        } else if (!c.managerName) {
          c.managerName = row['?�명'];
          c.managerSabun = String(row['?�번']);
        }
      });

      // 2) 구성???�이?�로 ?�터가 비어?�으�?추�? �?직원 매핑
      memberData.forEach(row => {
        const centerName = row['?�터�?] || '미�??�센??;
        if (!centerMap[centerName]) {
          centerMap[centerName] = {
            id: centerIdCounter++,
            name: centerName,
            region: mapRegion(row['?�당/??]),
            leaderName: '가?�센?�장',
            leaderSabun: '99999',
            managerName: '가?�실??,
            managerSabun: '88888'
          };
        }
        
        const center = centerMap[centerName];
        const empId = employeeIdCounter++;
        
        state.employees.push({
          id: empId,
          centerId: center.id,
          region: center.region,
          name: row['?�명'] || '?�름?�음',
          sabun: String(row['?�번'] || empId),
          rank: row['직책'] || '매니?�',
          registeredClass: null,
          registeredDate: null
        });
      });

      state.centers = Object.values(centerMap);

      // 3) 초기 ?�강 ?�청 ?�이??채우�?(?�체 ?�원????65%�?무작??차수??채워 ?�음 - ?��??�이???�도)
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

    // 5. 로컬?�토리�? ?�출??�?초기??    let isInitialLoad = true;

    function loadState() {
      const saved = localStorage.getItem(STATE_KEY);
      if (saved) {
        try {
          appState = JSON.parse(saved);
          if (!appState.centers) appState.centers = [];
          if (!appState.employees) appState.employees = [];
        } catch (e) {
          appState = generateInitialState();
          saveState();
        }
      } else {
        appState = generateInitialState();
        saveState();
      }
      
      isInitialLoad = false;
      updateSimTimeUI();
      checkSession();
    }

    function saveState() {
      localStorage.setItem(STATE_KEY, JSON.stringify(appState));
    }

    // 6. 비즈?�스 ?�심 로직 ?�산�?    
    // 마감 기한 ?�산 (?�작??2????00:00:00 ?�정 기�? 마감 ?��?)
    // ?�늘 ?�짜가 ?�작??- 2???�정보다 ?�거??같으�?Locked
    function isClassDateLocked(startDateStr, currentSimTimeStr) {
      const start = new Date(startDateStr);
      
      // 마감??계산: ?�작?�로부??2???�으�??�짜 차감
      const lockLimit = new Date(start);
      lockLimit.setDate(lockLimit.getDate() - 2);
      lockLimit.setHours(0, 0, 0, 0); // 2????00:00:00 ?�정
      
      const current = new Date(currentSimTimeStr);
      return current >= lockLimit;
    }

    // 차수�??�청?�원 ?�기
    function getClassEnrollmentCount(region, classNum) {
      return appState.employees.filter(e => e.region === region && e.registeredClass === classNum).length;
    }

    // 차수 ?�태 진단 ('OPEN' | 'FULL' | 'LOCKED')
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

    // 7. 로그??/ 로그?�웃 ?�스??(Firebase ?�동?�로 ?�벤???�들?�에??직접 처리)

    function employeeCounterNext() {
      if (!window.empCounter) {
        window.empCounter = 900000;
      }
      return window.empCounter++;
    }

    // ================= UI 컨트롤러 �??�면 ?�더??=================

    // ?�리먼트 참조 캐싱
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
      
      // 모달 ?�리먼트??      modalRegister: document.getElementById('modal-register'),
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

    // 모달 ?�어 ?�역 매개변??    let activeRegisteringEmployee = null; // ?�재 ?�강?�청???�정/?�록 중인 매니?� 객체
    let selectedRegistrationClassNum = null; // ?�청 모달?�서 ?�택???�규 차수 번호

    // 초기???�수
    function init() {
      bindEvents();
      loadState();
    }

    // 8. ?�션 �??�짜 ?��??�이???�기??    function checkSession() {
      const savedSession = sessionStorage.getItem('LGE_REG_SESSION');
      if (savedSession) {
        currentUser = JSON.parse(savedSession);
        
        if (currentUser.role !== 'admin') {
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

    // 9. ?�?�보???�더�??�진
    function renderDashboard() {
      if (!currentUser) return;

      // ?�더 ?�로???�팅
      els.userInitial.innerText = currentUser.name.charAt(0);
      els.userNameTitle.innerText = `${currentUser.name} ${currentUser.role}`;
      els.userCenterTitle.innerText = `${currentUser.region} · ${currentUser.centerName}`;

      // ?�터 구성???�이??계산
      const centerEmployees = appState.employees.filter(e => e.centerId === currentUser.centerId);
      const total = centerEmployees.length;
      const registered = centerEmployees.filter(e => e.registeredClass !== null).length;
      const unregistered = total - registered;
      const rate = total > 0 ? ((registered / total) * 100).toFixed(1) : '0.0';

      els.statCenterTotal.innerText = `${total}�?;
      els.statCenterRegistered.innerText = `${registered}�?;
      els.statCenterUnregistered.innerText = `${unregistered}�?;
      els.statCenterRate.innerText = `${rate}%`;

      // ?�이�??�더�?      renderEmployeeTable(centerEmployees);

      // ?�측 차수 ?�황???�더�?      els.sideRegionTitle.innerText = currentUser.region;
      renderSideClassSummary();
    }

    // 10. ?�터 구성??목록 ?�이�??�더�?    function renderEmployeeTable(employees) {
      els.managerTableBody.innerHTML = '';
      
      if (employees.length === 0) {
        els.managerTableBody.innerHTML = `<tr><td colspan="7" class="empty-table-msg" style="text-align:center; padding: 40px; color: var(--slate-400);">?�터 ?�속 매니?�가 존재?��? ?�습?�다.</td></tr>`;
        return;
      }

      // ?�름 ?�름차순 ?�렬
      employees.sort((a, b) => a.name.localeCompare(b.name));

      employees.forEach(emp => {
        const tr = document.createElement('tr');
        
        // ?�청 ?�보 추출
        let statusBadgeHtml = '';
        let classText = '-';
        let periodText = '-';
        let actionButtonsHtml = '';

        if (emp.registeredClass === null) {
          statusBadgeHtml = `<span class="status-badge orange">미신�?/span>`;
          actionButtonsHtml = `<button class="btn-table-action primary btn-act-register" data-sabun="${emp.sabun}">?�강?�청</button>`;
        } else {
          const schedule = appState.classSchedules[emp.region].find(s => s.classNum === emp.registeredClass);
          const startDate = schedule ? schedule.startDate : '';
          const endDate = schedule ? schedule.endDate : '';
          
          // 차수가 ?�재 마감?�었?��? 계산
          const isLocked = schedule ? isClassDateLocked(startDate, appState.currentSimTime) : false;
          
          classText = `${emp.registeredClass}차수`;
          periodText = schedule ? `${startDate} ~ ${endDate}` : '-';

          if (isLocked) {
            statusBadgeHtml = `<span class="status-badge gray">?�� 교육마감</span>`;
            // 교육 마감??차수??변�?취소 버튼 차단 (?�내 문구)
            actionButtonsHtml = `<span class="locked-text" style="font-size: 11px; color: var(--slate-400); font-weight: 500;">?�� 변경불가 (기한만료)</span>`;
          } else {
            statusBadgeHtml = `<span class="status-badge green">?�청?�료</span>`;
            actionButtonsHtml = `
              <div class="action-btn-group">
                <button class="btn-table-action btn-act-register" data-sabun="${emp.sabun}">차수변�?/button>
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

      // ?�벤??리바?�딩
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

    // 11. ?�측 1~30차수 ?�시�?종합 ?�황???�더�?    function renderSideClassSummary() {
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
          statusBadge = `<span class="status-badge gray" style="font-size: 10px; padding: 2px 6px;">?�� 마감</span>`;
          fillClass = 'class="csc-progressfill full"';
        } else if (status === 'FULL') {
          statusBadge = `<span class="status-badge red" style="font-size: 10px; padding: 2px 6px;">?�원마감</span>`;
          fillClass = 'class="csc-progressfill full"';
        } else {
          statusBadge = `<span class="status-badge green" style="font-size: 10px; padding: 2px 6px;">?�청가??/span>`;
          fillClass = 'class="csc-progressfill"';
        }

        card.innerHTML = `
          <div class="csc-header">
            <span class="csc-title">${cls.classNum}차수</span>
            <span class="csc-ratio"><span class="filled">${count}</span> / 60�?/span>
          </div>
          <div class="csc-progressbar">
            <div ${fillClass} style="width: ${percent}%"></div>
          </div>
          <div class="csc-footer">
            <span class="csc-date">?�� ${cls.startDate} ~ ${cls.endDate}</span>
            <div style="display:flex; align-items:center; gap:8px;">
              ${statusBadge}
              <button class="btn-view-attendees" data-region="${region}" data-class="${cls.classNum}">?�청??보기</button>
            </div>
          </div>
        `;

        els.classSummaryContainer.appendChild(card);
      });

      // ?�청??보기 버튼 바인??      document.querySelectorAll('.btn-view-attendees').forEach(btn => {
        btn.addEventListener('click', function () {
          const reg = this.getAttribute('data-region');
          const cNum = parseInt(this.getAttribute('data-class'));
          openClassDetailsModal(reg, cNum);
        });
      });
    }

    // 12. ?�강?�청 / 변�?모달 ?�어
    function openRegisterModal(sabun) {
      const emp = appState.employees.find(e => e.sabun === sabun);
      if (!emp) return;

      activeRegisteringEmployee = emp;
      selectedRegistrationClassNum = null;

      // 모달 ?�단 ?�더?�보 바인??      els.regTargetName.innerText = emp.name;
      els.regTargetSabun.innerText = emp.sabun;
      els.regTargetRegion.innerText = emp.region;
      
      if (emp.registeredClass) {
        els.regCurrentStatus.className = 'status-badge blue';
        els.regCurrentStatus.innerText = `${emp.registeredClass}차수 ?�강�?;
        els.btnSubmitRegistration.innerText = '?�강 변�??�료';
      } else {
        els.regCurrentStatus.className = 'status-badge orange';
        els.regCurrentStatus.innerText = '미신�?;
        els.btnSubmitRegistration.innerText = '?�강 ?�청 ?�료';
      }

      // ?�청 불�???버튼 ?�성???�제
      els.btnSubmitRegistration.disabled = true;

      // ?�당 지??�� 1~30차수 리스???�더�?      const region = emp.region;
      const classes = appState.classSchedules[region];
      els.modalClassGrid.innerHTML = '';

      classes.forEach(cls => {
        const count = getClassEnrollmentCount(region, cls.classNum);
        const isEnrolledInThis = emp.registeredClass === cls.classNum;
        
        // ?�태 구하�?        const isDateLocked = isClassDateLocked(cls.startDate, appState.currentSimTime);
        const isFull = count >= 60;
        
        const card = document.createElement('div');
        card.className = 'class-select-card';
        
        // CSS ?�태 지??        if (isDateLocked) {
          card.classList.add('locked');
        } else if (isFull && !isEnrolledInThis) {
          card.classList.add('full');
        }

        if (isEnrolledInThis) {
          card.classList.add('selected');
          // ?�재 ?�강중인 곳이�??�태???��??�이 ?�택 처리
          card.innerHTML += `<span class="csc-badge-top current">?�재?�택</span>`;
        }

        card.innerHTML += `
          <span class="card-class-num">${cls.classNum}차수</span>
          <span class="card-class-date">${cls.startDate.substring(5)}</span>
          <span class="card-class-spots">?�원: <span>${count} / 60</span></span>
        `;

        // ?�택 가???�릭 ?�벤??        if (!isDateLocked && (!isFull || isEnrolledInThis)) {
          card.addEventListener('click', function () {
            // 기존 ?�택 ?�제
            document.querySelectorAll('.class-select-card').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            
            selectedRegistrationClassNum = cls.classNum;
            
            // ?�재?� ?�른 차수�??�택??경우?�만 ?�료버튼 ?�성??            if (emp.registeredClass === cls.classNum) {
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

      // 검�?로직 ?�차 체크
      const status = getClassStatus(region, targetClassNum);
      if (status === 'LOCKED') {
        alert('?�️ ?�당 차수??교육 ?�작 2???�으�??�강?�청??마감?�었?�니??');
        return;
      }
      if (status === 'FULL') {
        alert('?�️ ?�당 차수???��? ?�원(60�???만료?�었?�니??');
        return;
      }

      // 기존 ?�록 차수가 ?�었?�면, �?차수가 마감??차수?��? ?�인 (마감 차수??매니?�??변�?불�?)
      if (emp.registeredClass) {
        const oldSchedule = appState.classSchedules[region].find(s => s.classNum === emp.registeredClass);
        if (oldSchedule && isClassDateLocked(oldSchedule.startDate, appState.currentSimTime)) {
          alert('?�️ 기존???�속?�었??차수가 교육 ?�작 2????범위???�어 변경할 ???�습?�다.');
          return;
        }
      }

      // ?�청 처리
      const now = new Date(appState.currentSimTime);
      const dateStr = formatDate(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');

      emp.registeredClass = targetClassNum;
      emp.registeredDate = dateStr;

      saveState();
      closeModal('modal-register');
      renderDashboard();
      
      alert(`?�� [${emp.name} 매니?�] ?�강?�청???�공?�으�??�료?�었?�니?? (${targetClassNum}차수)`);
    }

    function handleCancelRegistration(sabun) {
      const emp = appState.employees.find(e => e.sabun === sabun);
      if (!emp || emp.registeredClass === null) return;

      const schedule = appState.classSchedules[emp.region].find(s => s.classNum === emp.registeredClass);
      if (schedule && isClassDateLocked(schedule.startDate, appState.currentSimTime)) {
        alert('?�️ 교육 ?�작 2????마감 ?�태?��?�? ?�강?�청 취소가 불�??�합?�다.');
        return;
      }

      if (confirm(`?�말�?[${emp.name} 매니?�]??${emp.registeredClass}차수 ?�강?�청??취소?�시겠습?�까?`)) {
        emp.registeredClass = null;
        emp.registeredDate = null;
        
        saveState();
        renderDashboard();
        alert('?�강?�청??취소?�었?�니??');
      }
    }

    // 13. 차수�??�세 ?�강??명단 모달 (?�느?�터 ?��? ?�강?�청 ?�어 ?�는지 ?�세 보기)
    function openClassDetailsModal(region, classNum) {
      const schedule = appState.classSchedules[region].find(s => s.classNum === classNum);
      if (!schedule) return;

      els.detailClassTitle.innerText = `${region} - ${classNum}차수`;
      els.detailClassDate.innerText = `?�� ${schedule.startDate} ~ ${schedule.endDate}`;
      
      const count = getClassEnrollmentCount(region, classNum);
      els.detailClassCount.innerText = `${count} / 60�?;

      const status = getClassStatus(region, classNum);
      if (status === 'LOCKED') {
        els.detailClassStatus.className = 'status-badge gray';
        els.detailClassStatus.innerText = '?�� 기간마감';
      } else if (status === 'FULL') {
        els.detailClassStatus.className = 'status-badge red';
        els.detailClassStatus.innerText = '?�� ?�원마감';
      } else {
        els.detailClassStatus.className = 'status-badge green';
        els.detailClassStatus.innerText = '?�청가??;
      }

      // ?�당 차수 ?�강???�터�?      const enrolledManagers = appState.employees.filter(e => e.region === region && e.registeredClass === classNum);
      
      // ?�터 �??�름 ?�름차순 ?�렬
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
      return center ? center.name : '?�수?�음';
    }

    // 14. 관리자 모달 �??�스?�드 ?�증
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

    // 15. ?�카?��? ?�체 종합 관리자 콘솔 ?�픈
    function openAdminPanel() {
      renderAdminDashboard();
      openModal('modal-admin-panel');
    }

    // 관리자 ?�?�보???�이???�산 �??�더�?    function renderAdminDashboard() {
      const total = appState.employees.length;
      const registered = appState.employees.filter(e => e.registeredClass !== null).length;
      const overallRate = total > 0 ? ((registered / total) * 100).toFixed(1) : '0.0';

      // ?�사 종합 지??바인??      els.adminTotalManagers.innerText = `${formatNumber(total)}�?;
      els.adminTotalProgress.style.width = `${overallRate}%`;
      els.adminTotalRegLbl.innerText = `�?${formatNumber(registered)}�??�청 ?�료 (${overallRate}%)`;

      // 1. ?�도�?지???�황
      const metAll = appState.employees.filter(e => e.region === '?�도�?);
      const metReg = metAll.filter(e => e.registeredClass !== null).length;
      const metRate = metAll.length > 0 ? ((metReg / metAll.length) * 100).toFixed(1) : '0.0';
      els.adminMetCount.innerText = `${formatNumber(metReg)} / ${formatNumber(metAll.length)}�?;
      els.adminMetProgress.style.width = `${metRate}%`;
      els.adminMetRate.innerText = `${metRate}%`;

      // 2. 중�?/강원??지???�황
      const cenAll = appState.employees.filter(e => e.region === '중�?/강원??);
      const cenReg = cenAll.filter(e => e.registeredClass !== null).length;
      const cenRate = cenAll.length > 0 ? ((cenReg / cenAll.length) * 100).toFixed(1) : '0.0';
      els.adminCenCount.innerText = `${formatNumber(cenReg)} / ${formatNumber(cenAll.length)}�?;
      els.adminCenProgress.style.width = `${cenRate}%`;
      els.adminCenRate.innerText = `${cenRate}%`;

      // 3. ?�남부/충청??지???�황
      const souAll = appState.employees.filter(e => e.region === '?�남부/충청??);
      const souReg = souAll.filter(e => e.registeredClass !== null).length;
      const souRate = souAll.length > 0 ? ((souReg / souAll.length) * 100).toFixed(1) : '0.0';
      els.adminSouCount.innerText = `${formatNumber(souReg)} / ${formatNumber(souAll.length)}�?;
      els.adminSouProgress.style.width = `${souRate}%`;
      els.adminSouRate.innerText = `${souRate}%`;

      // �?지??�� 1~30차수 ?�세 카드 목록 ?�더�?      renderAdminRegionGrid('?�도�?, els.adminGridMetro);
      renderAdminRegionGrid('중�?/강원??, els.adminGridCentral);
      renderAdminRegionGrid('?�남부/충청??, els.adminGridSouthwest);
    }

    function formatNumber(num) {
      return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // 관리자 차수 카드 그리???�더�?(?�정 ?�디??& ?�청 명단 ?�눈??보기)
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
          statusBadge = `<span class="status-badge gray" style="font-size:10px; padding:2px 6px;">?�� 기간마감</span>`;
          barClass = 'class="acc-progress-fill full"';
        } else if (status === 'FULL') {
          statusBadge = `<span class="status-badge red" style="font-size:10px; padding:2px 6px;">?�� ?�원초과</span>`;
          barClass = 'class="acc-progress-fill full"';
        } else {
          statusBadge = `<span class="status-badge green" style="font-size:10px; padding:2px 6px;">?�청가??/span>`;
          barClass = 'class="acc-progress-fill"';
        }

        // ?�강??미니 ?�그 리스???�성 (?�느 ?�터 ?��? ?�청?�는지 ?�눈???�악)
        let tagsHtml = '';
        if (enrolled.length === 0) {
          tagsHtml = `<div class="acc-empty">?�청???�음</div>`;
        } else {
          enrolled.sort((a, b) => getCenterName(a.centerId).localeCompare(getCenterName(b.centerId)));
          
          enrolled.forEach(emp => {
            const cName = getCenterName(emp.centerId).replace('?�터', '');
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
              <label>교육 ?�작??변�?/label>
              <input type="date" class="admin-input-class-date" data-region="${region}" data-class="${cls.classNum}" value="${cls.startDate}">
            </div>
          </div>

          <div class="acc-stats">
            <span>?�청 ?�원</span>
            <span class="filled-cnt">${count} / 60�?/span>
          </div>
          <div class="acc-progress-container">
            <div ${barClass} style="width: ${percent}%"></div>
          </div>

          <div class="acc-attendee-area">
            <div class="acc-attendee-title">?�강 ?�청??명단 (${count}�?</div>
            <div class="acc-attendee-list-mini">
              ${tagsHtml}
            </div>
            <button class="btn-acc-download btn-csv-class-export" data-region="${region}" data-class="${cls.classNum}">
              ?�� ??차수 명단 ?��? ?�운로드
            </button>
          </div>
        `;

        container.appendChild(card);
      });

      // ?�작?�자 강제 ?�집 ?�벤??리스??바인??(2????마감 �??�스?�용)
      container.querySelectorAll('.admin-input-class-date').forEach(input => {
        input.addEventListener('change', function () {
          const reg = this.getAttribute('data-region');
          const cNum = parseInt(this.getAttribute('data-class'));
          const newStartStr = this.value;
          
          if (!newStartStr) return;

          // ?�나???�짜??5??주말교육 모사 (+4??
          const start = new Date(newStartStr);
          const end = new Date(start);
          end.setDate(end.getDate() + 4);

          const target = appState.classSchedules[reg].find(s => s.classNum === cNum);
          if (target) {
            target.startDate = newStartStr;
            target.endDate = formatDate(end);
            
            saveState();
            renderAdminDashboard();
            renderDashboard(); // ?�쪽 ?�?�보?�도 ?�시 갱신
            console.log(`Updated class date for ${reg} ${cNum}차수: ${newStartStr}`);
          }
        });
      });

      // 차수�?명단 ?�운로드 ?�벤??바인??      container.querySelectorAll('.btn-csv-class-export').forEach(btn => {
        btn.addEventListener('click', function () {
          const reg = this.getAttribute('data-region');
          const cNum = parseInt(this.getAttribute('data-class'));
          exportClassToCSV(reg, cNum);
        });
      });
    }

    // 16. CSV ?��? ?�운로드 ?�진 (UTF-8 BOM 주입?�로 ?��? 깨짐 ?�천 방�?)
    function exportClassToCSV(region, classNum) {
      const schedule = appState.classSchedules[region].find(s => s.classNum === classNum);
      if (!schedule) return;

      const enrolled = appState.employees.filter(e => e.region === region && e.registeredClass === classNum);
      
      // ?�더 ?�의
      let csvContent = "?�번,지??��???�터�??�번,?�명,직급,?�청차수,교육 ?�작??교육 종료???�청?�시\n";
      
      if (enrolled.length === 0) {
        csvContent += "?�청???�음,,,,,,\n";
      } else {
        enrolled.sort((a, b) => getCenterName(a.centerId).localeCompare(getCenterName(b.centerId)));
        enrolled.forEach((emp, index) => {
          const centerName = getCenterName(emp.centerId);
          csvContent += `${index + 1},${emp.region},${centerName},${emp.sabun},${emp.name},${emp.rank},${emp.registeredClass}차수,${schedule.startDate},${schedule.endDate},${emp.registeredDate || '-'}\n`;
        });
      }

      // ?�운로드 ?�행
      triggerCSVDownload(`${region.replace('/', '_')}_${classNum}차수_?�강명단.csv`, csvContent);
    }

    function exportAllToCSV(filterRegion = null) {
      let filename = '?�사_?�비?�매?��?_?�사?�과???�강?�청명단.csv';
      let filteredEmployees = appState.employees.filter(e => e.registeredClass !== null);

      if (filterRegion) {
        filteredEmployees = filteredEmployees.filter(e => e.region === filterRegion);
        filename = `${filterRegion.replace('/', '_')}_?�비?�매?��?_?�강?�청명단.csv`;
      }

      // ?�렬: 지?? 차수, ?�터, ?�름 ??      filteredEmployees.sort((a, b) => {
        if (a.region !== b.region) return a.region.localeCompare(b.region);
        if (a.registeredClass !== b.registeredClass) return a.registeredClass - b.registeredClass;
        const cA = getCenterName(a.centerId);
        const cB = getCenterName(b.centerId);
        if (cA !== cB) return cA.localeCompare(cB);
        return a.name.localeCompare(b.name);
      });

      let csvContent = "?�번,지??��???�터�??�번,?�명,직급,?�청차수,교육 ?�작??교육 종료???�청?�시\n";

      if (filteredEmployees.length === 0) {
        csvContent += "?�록???�강 ?�청?��? ?�습?�다.,,,,,,\n";
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
      // UTF-8 ?�코?�에???��????��????�식?????�도�?BOM(\uFEFF)???�두??주입?�니??
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, content], { type: 'text/csv;charset=utf-8;' });
      
      if (navigator.msSaveBlob) { // IE ?�환??        navigator.msSaveBlob(blob, filename);
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

    // 17. 공통 모달 ?�오???�구
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

    // 18. ?�벤??바인??마스??    function bindEvents() {
      // 로그??처리
      els.loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (isInitialLoad) {
          alert('?�스???�이?��? ?�동 중입?�다. ??1~3�????�시 ?�도?�주?�요.');
          return;
        }
        
        const name = els.loginName.value.trim();
        const sabun = els.loginSabun.value.trim();

        // 관리자 체크
        if (name === '?�드�? && sabun === '9999') {
          currentUser = { role: 'admin', name: '?�드�?, sabun: '9999' };
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
          alert('?�치?�는 ?�터???�는 ?�장 ?�보가 ?�습?�다.\\n?�름�??�번???�바르게 ?�력?�주?�요.');
          return;
        }

        // ?�터 ??체크
              // 로컬스토리지 버전에서는 동시 접속 제어를 수행하지 않습니다.
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

      // 로그?�웃
      els.btnLogout.addEventListener('click', function () {
        if (confirm('?�말�?로그?�웃 ?�시겠습?�까?')) {
          sessionStorage.removeItem('LGE_REG_SESSION');
          currentUser = null;
          showPage('login-container');
        }
      });

      // 모달 공통 ?�기 버튼 바인??      document.querySelectorAll('.btn-close-modal').forEach(btn => {
        btn.addEventListener('click', function () {
          // 부�?모달 ?�버?�이 찾기
          const overlay = this.closest('.modal-overlay');
          if (overlay) {
            overlay.classList.remove('active-modal');
          }
        });
      });

      // ?�강?�청 ?�출 버튼
      els.btnSubmitRegistration.addEventListener('click', handleAddRegistrationSubmit);

      // ?�터???�규 구성???�동 추�?
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

        // ?�번 중복 ?�인
        const duplicate = appState.employees.find(emp => emp.sabun === sabun);
        if (duplicate) {
          alert('?�️ ?��? ?�록?�어 ?�는 ?�번?�니?? ?�른 ?�번???�력??주세??');
          return;
        }

        // ?�록
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
        
        alert(`?�� [${name} 매니?�]가 ?�공?�으�??�리 ?�터??명단??추�??�었?�니??`);
      });

      // ?�짜 ?��??�이???�용 버튼
      els.btnApplySimDate.addEventListener('click', () => {
        const newSim = els.simDateInput.value;
        if (!newSim) return;
        
        appState.currentSimTime = newSim;
        saveState();
        updateSimTimeUI();
        
        // ?�면 ?�체 갱신 (마감 ?�태가 즉석 변경됨)
        if (currentUser) {
          renderDashboard();
        }
        
        // 관리자 ?�면???�려 ?�다�?갱신
        if (els.modalAdminPanel.classList.contains('active-modal')) {
          renderAdminDashboard();
        }

        alert(`??가???�짜가 ?�공?�으�?변경되?�습?�다.\n${newSim.replace('T', ' ')} 기�??�로 ?�원 �?마감 ?�태가 ?�계?�됩?�다.`);
      });

      // ?�짜 ?��??�이??리셋
      els.btnResetSimDate.addEventListener('click', () => {
        const now = new Date();
        // YYYY-MM-DDTHH:MM ?�맷??        const y = now.getFullYear();
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

        alert('???�스???�각???�재 ?�제 ?�각?�로 리셋?�었?�니??');
      });

      // 관리자 진입 ?�증 ???�출
      els.btnGotoAdmin.addEventListener('click', () => {
        els.adminPassword.value = '';
        els.adminAuthError.style.display = 'none';
        openModal('modal-admin-auth');
      });

      els.adminAuthForm.addEventListener('submit', handleAdminAuthSubmit);

      // 관리자 종합 CSV ?�운로드
      els.btnExportExcel.addEventListener('click', () => {
        exportAllToCSV();
      });

      // 관리자 ?�일지??CSV ?�운로드
      document.querySelectorAll('.btn-export-region-excel').forEach(btn => {
        btn.addEventListener('click', function () {
          const reg = this.getAttribute('data-region');
          exportAllToCSV(reg);
        });
      });

      // 관리자 ???�환 ?�어
      document.querySelectorAll('.region-tabs-container .tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          // 버튼 ?�티�??�래??부??          document.querySelectorAll('.region-tabs-container .tab-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');

          const tabId = this.getAttribute('data-tab');
          
          if (tabId === 'tab-all-regions') {
            // ?�체 지???�출
            document.querySelectorAll('.region-content-section').forEach(sec => sec.classList.add('active-section'));
          } else {
            // 개별 지???�출
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

      // 관리자 ?�이??초기??      els.btnAdminResetData.addEventListener('click', () => {
        if (confirm('?�� 주의: 모든 ?�강?�청 ?�보?� ?�의 ?�정??차수 ?�정???�구 ??��?�고 초기?�됩?�다. 계속?�시겠습?�까?')) {
          appState = generateInitialState();
          saveState();
          closeModal('modal-admin-panel');
          
          if (currentUser) {
            // ?�션 ?��?�?            const stillExists = appState.centers.some(c => c.id === currentUser.centerId);
            if (stillExists) {
              renderDashboard();
            } else {
              sessionStorage.removeItem('LGE_REG_SESSION');
              currentUser = null;
              showPage('login-container');
            }
          }
          alert('?�이?�베?�스가 공장 출하 초기 모사 ?�태�?복구?�었?�니??');
        }
      });
    }

    // 19. ?�행 ?�작
    init();
  } catch (err) {
    alert("?�� app.js ?��? ?�류 발생\n?�용: " + err.message + "\n" + err.stack);
  }
})();




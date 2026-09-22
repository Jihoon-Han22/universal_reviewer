# 독립 환경·검증 감사: 수정 전

검토자 실제 가용 ID: `/root/verification_audit`. 역할은 소스 대조 정확성 평가이며 소스 비열람 명확성 평가는 다른 평가자가 담당한다. 신규1/재사용0/하위0. 원본 및 설계 파일을 수정하기 전 기록이다.

[기계 판독 보고서](verification-accuracy.json)에 50개 읽기 경로·hash, 211개 reverse source inventory, 신규12질문과 근거를 보존했다. 원래203질문은 이 보고서에서 재채점하지 않는다. 제안 모집단은 CORE-20 환경4질문, CORE-21 검증8질문이며 정확성 통과7/12=58.33%, 미해결5건이다. 명확성/모호성은 독립 비열람 평가 전이므로 미평가다.

- CORE-20: 4/4=100%. 설치/lock/config/build scripts10쌍 byte-identical.
- CORE-21: 3/8=37.5%. 아래5건은 실패로 계상한다.
- 직접 module sourceFiles 매핑114/211=54.03%. 구현·설정만은114/139=82.01%. 미매핑97개에는 테스트59, 타입선언11, 생성runtime1, README1, 구현·설정25가 포함된다. 테스트 일부는 core-tree 표에 따로 존재하므로97개를 모두 기능누락으로 주장하지 않는다. ExtractedFields.tsx는 src에서 import되지 않으므로 unused 분류 대상이다.

|이슈|중요도|확인 결과|필요 보완|
|---|---|---|---|
|VER-01|medium|환경/검증 모듈과 전수 역방향 분류 없음|신규 모듈·질문, 파일별 연결/제외 근거|
|VER-02|high|timeout5ms,75ms 뒤 signal.aborted=true인데 passed/exit0|abort 후 결과 거부·cleanup grace 의미·음성시험|
|VER-03|high|실제 architecture 없이 {files:[]} manifest도 ready 판정|현재 package 무결성·manifest 및 gate hash 결합|
|VER-04|medium|providerCalls 문자열1/holdout seeds 문자열3 통과|안전정수 형식·범위 검증|
|VER-05|low|P10 PNG4/PDF8 평가 projection 부재|원본 verify-golden expectedCertificate 규칙 명문화|

실제 실행은 전용 cache의 합성 verifier probe뿐이다. 제품 재구현/provider/browser/server는 NOT_RUN, completeProductAcceptance=false다. 과거 evidence는 이번 실행 근거로 사용하지 않았다. 현 설계의 203질문100점은 과거 모집단에 대한 주장이지 위 새 질문의 통과 근거가 아니다.

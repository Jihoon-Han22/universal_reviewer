# 검증 도구 수정·자체 회귀

작성자 `/root/verification_audit`는 최초 평가자를 재사용한 수정 담당자다(신규0/재사용1/자식0). 독립 최종 확인 담당은 `/root/final_cross_review`이며 본 기록은 자기 승인 점수가 아니다.

[정확한 변경10파일·수정 전후 SHA·실행 기록](verification-fixes.json)을 보존했다. 원본 source나 과거 evidence는 수정하지 않았다.

- VER-02: timeout 이후 늦은 성공 반환 거부. 부모 deadline과10초 cleanup 여유를 분리했다.
- VER-03: 실제 architecture의 package 검증 및 각 gate의 packageManifestSha256를 확인한다. manifest를 갱신해도 과거 gate는 재사용하지 못한다.
- VER-04: provider/holdout 수의 문자열·boolean·소수·안전정수 범위 이탈을 거부한다.
- 독립 재검토 신규 발견: harness timeout 상한21600000ms와 evidence 중간 경로 junction 차단을 추가했다. 최초 평가의 미검토를 소급 pass로 바꾸지 않는다.
- 공용 synthetic package fixture를 추출하여 빈 manifest를 양성 대조로 사용하던 selftest를 유효 패키지 대조로 바꿨다.

실제 적용 파일로 실행한 검증기 자체시험은 **38/38 통과, 실패0, skip0, exit0**다. 모든 임시 쓰기는 전용 cache cwd 아래였다. 제품 재구현·provider·브라우저는 NOT_RUN, completeProductAcceptance=false다.

root 담당 registry/source reverse mapping/P10/score/package validator 보완과 독립 재평가·최종 package freeze는 별도 진행한다. 도구 입력이 더 바뀌면 이 기록은 해당 과거 hash의 자체시험으로만 해석한다.

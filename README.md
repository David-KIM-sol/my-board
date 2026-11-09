# my-board

Claude Code 화면 옆에 띄우는 나만의 Claude 보드입니다.

- **사용량**: 5시간·주간 한도와 컨텍스트를 3중 원그래프로, 초기화까지 남은 시간과 함께 보여 줍니다. 80%·95%를 넘으면 알림이 뜹니다.
- **컨텍스트 구성**: 대화·도구·스킬이 컨텍스트를 얼마나 차지하는지 막대그래프로 보여 줍니다.
- **최근 6시간 추이**: 사용량이 어떻게 움직였는지 선그래프로 보여 줍니다.
- **빠른 전환**: 모델, 답변 스타일, 권한 모드를 버튼 하나로 바꿉니다.
- **연결된 데이터**: 지금 쓸 수 있는 커넥터를 그룹별로 보여 줍니다.
- 입력창 아래 상태줄에 사용량 한 줄 요약이 항상 표시됩니다. 패널을 닫았다면 `/board`로 다시 엽니다.

커넥터 이름표는 `hooks/register.tsx`의 `CONNECTORS` 목록에 직접 적혀 있습니다. 새 커넥터는 "새 커넥터 ○○○○"로 나오니 그때 한 줄 추가하세요.

## 설치

터미널의 Claude Code 프롬프트에서:

```
/plugin install my-board --marketplace David-KIM-sol/my-board
```

셸에서:

```bash
claude plugin install my-board --marketplace David-KIM-sol/my-board
```

데스크톱 앱(`/plugin`이 안 되는 곳)에서는 입력창 옆 + → Plugins → Add marketplace에 `David-KIM-sol/my-board`를 넣고 Add plugin을 누릅니다.

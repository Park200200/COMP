// 다음 우편번호 서비스 타입 선언
declare namespace daum {
  class Postcode {
    constructor(options: {
      oncomplete: (data: {
        address: string;
        addressType: string;
        bname: string;
        buildingName: string;
        zonecode: string;
        jibunAddress: string;
        roadAddress: string;
        autoJibunAddress: string;
        autoRoadAddress: string;
        userSelectedType: string;
      }) => void;
      onclose?: () => void;
      width?: string | number;
      height?: string | number;
    });
    open(): void;
    embed(element: HTMLElement): void;
  }
}

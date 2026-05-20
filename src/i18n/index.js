import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

i18n.use(initReactI18next).init({
  lng: 'ko',
  fallbackLng: 'ko',
  resources: {
    ko: {
      translation: {
        menu: '메뉴', order: '주문하기', soldOut: '품절',
        cookTime: '약 {{min}}분', cookTimeAI: '약 {{min}}분 (AI 예측)',
        waiting: '대기 {{count}}건', orderComplete: '주문이 완료됐어요!',
        tableNotFound: '테이블 정보를 찾을 수 없어요',
        total: '총', voiceOrder: '음성 주문', listening: '듣는 중...',
        voiceResult: '인식됨', stock: '잔여 {{count}}개', cancel: '취소'
      }
    },
    en: {
      translation: {
        menu: 'Menu', order: 'Order Now', soldOut: 'Sold Out',
        cookTime: '~{{min}} min', cookTimeAI: '~{{min}} min (AI est.)',
        waiting: '{{count}} ahead', orderComplete: 'Order placed!',
        tableNotFound: 'Table not found',
        total: 'Total', voiceOrder: 'Voice Order', listening: 'Listening...',
        voiceResult: 'Heard', stock: '{{count}} left', cancel: 'Cancel'
      }
    },
    zh: {
      translation: {
        menu: '菜单', order: '下单', soldOut: '售罄',
        cookTime: '约{{min}}分钟', cookTimeAI: '约{{min}}分钟 (AI预测)',
        waiting: '前{{count}}单等待', orderComplete: '订单完成！',
        tableNotFound: '找不到桌子',
        total: '合计', voiceOrder: '语音点餐', listening: '聆听中...',
        voiceResult: '识别', stock: '剩余{{count}}个', cancel: '取消'
      }
    },
    ja: {
      translation: {
        menu: 'メニュー', order: '注文する', soldOut: '売り切れ',
        cookTime: '約{{min}}分', cookTimeAI: '約{{min}}分 (AI予測)',
        waiting: '{{count}}件待ち', orderComplete: 'ご注文ありがとうございます！',
        tableNotFound: 'テーブルが見つかりません',
        total: '合計', voiceOrder: '音声注文', listening: '聞いています...',
        voiceResult: '認識', stock: '残り{{count}}個', cancel: 'キャンセル'
      }
    }
  }
})

export default i18n
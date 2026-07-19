/**
 * 水印模板类型(watermark-templates;仅 pro_plus 套餐可创建 / 更新)。
 */

/** 水印类型:text = 文字水印,image = 图片水印 */
export type WatermarkType = 'text' | 'image'

/** 水印位置 */
export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'

/** 水印模板对象 */
export interface WatermarkTemplate {
  /** 模板 ID(nanoid 21 字符) */
  id: string
  /** 模板名称 */
  name: string
  type: WatermarkType
  position?: WatermarkPosition
  /** 透明度(0=全透明,1=不透明) */
  opacity?: number
  /** 水印文字(type=text 时有效) */
  text?: string
  /** 字号(px),type=text 时有效 */
  fontSize?: number
  /** 水印图片 URL(type=image 时有效) */
  imageUrl?: string
  createdAt: string
  updatedAt: string
}

/** POST / PATCH watermark-templates 入参(create 与 update 共用同一 schema) */
export interface WatermarkTemplateInput {
  /** 模板名称(1-100 字符) */
  name: string
  type: WatermarkType
  position?: WatermarkPosition
  /** 透明度(0-1) */
  opacity?: number
  /** 水印文字(type=text 时必填) */
  text?: string
  /** 字号(px,8-200) */
  fontSize?: number
  /** 水印图片 URL(type=image 时必填) */
  imageUrl?: string
}

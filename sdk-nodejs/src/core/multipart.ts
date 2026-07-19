/**
 * multipart/form-data 构造 helper(v0.3.0,Node 18+ 原生 FormData / Blob)。
 *
 * 统一各上传端点(images / videos / audio / docs / avatar)的文件入参形态:
 * 消费者可传 Blob、ArrayBuffer、Uint8Array(含 Node Buffer —— Buffer 是 Uint8Array 子类)。
 *
 * 注意:构造出的 FormData 直接作为 fetch body 透传,**不要手动设置 Content-Type**
 * (boundary 由 fetch 自动生成;手动设置会导致服务端解析失败)。core/http.ts 已按
 * FormData 类型自动跳过 JSON Content-Type。
 */

/** 上传文件的可接受形态 */
export type UploadSource = Blob | ArrayBuffer | Uint8Array

export interface FilePart {
  /** 文件内容 */
  file: UploadSource
  /** 文件名(服务端据扩展名做格式白名单校验,必填) */
  filename: string
  /** MIME 类型;缺省时 Blob 用自身 type,其余为 application/octet-stream */
  contentType?: string
}

/**
 * 构造上传用 FormData。
 *
 * @param fileField  文件字段名(Picora 上传端点统一为 'file')
 * @param part       文件内容与元信息
 * @param fields     附加表单字段(如 tags / isPublic / collectionId 等,统一转字符串)
 */
export function toFormData(
  fileField: string,
  part: FilePart,
  fields?: Record<string, string | number | boolean | undefined>,
): FormData {
  const form = new FormData()

  let blob: Blob
  if (part.file instanceof Blob) {
    blob = part.contentType !== undefined && part.file.type !== part.contentType
      ? new Blob([part.file], { type: part.contentType })
      : part.file
  } else {
    // ArrayBuffer / Uint8Array(含 Buffer)→ 先复制为独立 ArrayBuffer 再包 Blob:
    // 规避 Uint8Array<ArrayBufferLike>(可能背靠 SharedArrayBuffer)不满足 BlobPart
    // 类型约束的问题;上传文件体积可控,一次复制成本可接受
    const bytes: ArrayBuffer = part.file instanceof Uint8Array
      ? (new Uint8Array(part.file).buffer as ArrayBuffer)
      : part.file
    blob = new Blob([bytes], { type: part.contentType ?? 'application/octet-stream' })
  }
  form.set(fileField, blob, part.filename)

  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue
      form.set(k, String(v))
    }
  }
  return form
}

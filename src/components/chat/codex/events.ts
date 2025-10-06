import type { ThreadItem } from './items'

export type ThreadStartedEvent = {
  type: 'thread.started'
  thread_id: string
}

export type TurnStartedEvent = {
  type: 'turn.started'
}

export type Usage = {
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
}

export type TurnCompletedEvent = {
  type: 'turn.completed'
  usage: Usage
}

export type TurnFailedEvent = {
  type: 'turn.failed'
  error: ThreadError
}

export type ItemStartedEvent = {
  type: 'item.started'
  item: ThreadItem
}

export type ItemUpdatedEvent = {
  type: 'item.updated'
  item: ThreadItem
}

export type ItemCompletedEvent = {
  type: 'item.completed'
  item: ThreadItem
}

export type ThreadError = {
  message: string
}

export type ThreadErrorEvent = {
  type: 'error'
  message: string
}

type DeltaContent = {
  type?: string
  text?: string
}

type ResponseDeltaPayload =
  | string
  | {
      text?: string
      delta?: string
      content?: DeltaContent[]
    }
  | Array<DeltaContent | string>

export type ResponseOutputTextDeltaEvent = {
  type: 'response.output_text.delta'
  delta: ResponseDeltaPayload
}

export type ResponseDeltaEvent = {
  type: 'response.delta'
  delta: ResponseDeltaPayload
}

type ResponseOutput = {
  type?: string
  text?: string
}

type ResponseEnvelope = {
  text?: string
  output?: ResponseOutput[]
}

export type ResponseCompletedEvent = {
  type: 'response.completed'
  response?: ResponseEnvelope
}

export type ResponseErrorEvent = {
  type: 'response.error'
  error?: {
    message?: string
  }
}

export type ThreadEvent =
  | ThreadStartedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | ThreadErrorEvent
  | ResponseOutputTextDeltaEvent
  | ResponseDeltaEvent
  | ResponseCompletedEvent
  | ResponseErrorEvent

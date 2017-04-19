import * as fn from '../functions'
import * as utils from '../utils/AltUtils'
import isPromise from 'is-promise'

export default function makeAction(alt, namespace, name, implementation, obj) {
  const id = utils.uid(alt._actionsRegistry, `${namespace}.${name}`)
  alt._actionsRegistry[id] = 1


  let logAs
  let storeStateToLog
  // Set action's log level
  if (typeof Reflect === 'object' && fn.isFunction(Reflect.getOwnMetadata)) {
    logAs = Reflect.getOwnMetadata('alt:meta:logAs', implementation)
  }
  // Set action's additional store state data
  if (typeof Reflect === 'object' && fn.isFunction(Reflect.getOwnMetadata)) {
    storeStateToLog = Reflect.getOwnMetadata(
      'alt:meta:storeStateToLog',
      implementation
    )
  }

  const data = { id, namespace, name, logAs, storeStateToLog }

  const dispatch = (payload) => alt.dispatch(id, payload, data)

  // the action itself
  const action = (...args) => {
    let inject
    // check for action's implementation metadata if dispatch should be injected
    // for example when decorated via @Reflect.metadata
    // (https://github.com/rbuckton/ReflectDecorators#syntax)
    if (typeof Reflect === 'object' && fn.isFunction(Reflect.getOwnMetadata)) {
      inject = Reflect.getOwnMetadata('alt:injectDispatch', implementation)

      if (inject === true) {
        // diff number of declared arguments and number of passed in arguments
        const diff = implementation.length - args.length

        if (diff > 0) {
          const optionalArgs = Array.apply(null, Array(diff))
          // explicitely pass optional parameters as undefined
          args.push.apply(args, optionalArgs)
        }

        // pass dispatch as the n+1 th parameter to action implementation
        args.push(dispatch)
      }
    }

    const invocationResult = implementation.apply(obj, args)

    let actionResult = invocationResult

    // async functions that return promises should not be dispatched
    if (invocationResult !== undefined && !isPromise(invocationResult)) {
      if (fn.isFunction(invocationResult)) {
        // inner function result should be returned as an action result
        actionResult = invocationResult(dispatch, alt)
      } else {
        if (!inject) {
          dispatch(invocationResult)
        }
      }
    }

    if (!inject && invocationResult === undefined) {
      utils.warn('An action was called but nothing was dispatched')
    }

    return actionResult
  }
  action.defer = (...args) => setTimeout(() => action.apply(null, args))
  action.id = id
  action.data = data
  action.dispatch = dispatch

  // ensure each reference is unique in the namespace
  const container = alt.actions[namespace]
  const namespaceId = utils.uid(container, name)
  container[namespaceId] = action

  // generate a constant
  const constant = utils.formatAsConstant(namespaceId)
  container[constant] = id

  return action
}

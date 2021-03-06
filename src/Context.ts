import { FunctionInfo } from './FunctionInfo';
import { fromRpcHttp, fromTypedData, getNormalizedBindingData, getBindingDefinitions } from './Converters';
import { AzureFunctionsRpcMessages as rpc } from '../azure-functions-language-worker-protobuf/src/rpc';
import { Request, RequestProperties } from './http/Request';
import { Response } from './http/Response';
import LogLevel = rpc.RpcLog.Level;
import { Context, ExecutionContext, Logger, BindingDefinition, HttpRequest } from './public/Interfaces' 

export function CreateContextAndInputs(info: FunctionInfo, request: rpc.IInvocationRequest, logCallback: LogCallback, callback: ResultCallback) {
  let context = new InvocationContext(info, request, logCallback, callback);

  let bindings: Dict<any> = {};
  let inputs: InputTypes[] = [];
  let httpInput: RequestProperties | undefined;
  for (let binding of <rpc.IParameterBinding[]>request.inputData) {
    if (binding.data && binding.name) {
      let input: InputTypes;
      if (binding.data && binding.data.http) {
        input = httpInput = fromRpcHttp(binding.data.http);
      } else {
        input = fromTypedData(binding.data);
      }
      bindings[binding.name] = input;
      inputs.push(input);
    }
  }
  
  context.bindings = bindings;
  if (httpInput) {
    context.req = new Request(httpInput);
    context.res = new Response(context.done);
  }
  return {
    context: <Context>context,
    inputs: inputs
  }
}

class InvocationContext implements Context {
  invocationId: string;
  executionContext: ExecutionContext;
  bindings: Dict<any>;
  bindingData: Dict<any>;
  bindingDefinitions: BindingDefinition[];
  log: Logger;
  req?: Request;
  res?: Response;
  done: DoneCallback;

  constructor(info: FunctionInfo, request: rpc.IInvocationRequest, logCallback: LogCallback, callback: ResultCallback) {
    this.invocationId = <string>request.invocationId;
    this.executionContext = {
      invocationId: this.invocationId,
      functionName: <string>info.name,
      functionDirectory: <string>info.directory
    };
    this.bindings = {};

    this.log = getLogger(this.invocationId, this.executionContext.functionName, logCallback);
    this.bindingData = getNormalizedBindingData(request);
    this.bindingDefinitions = getBindingDefinitions(info);

    let _done = false;
    let _promise = false;
    // isPromise is a hidden parameter that we set to true in the event of a returned promise
    this.done = (err?: any, result?: any, isPromise?: boolean) => {
      _promise = isPromise === true;
      if (_done) {
        if (_promise) {
          this.log.error("Error: Choose either to return a promise or call 'done'.  Do not use both in your script.");
        } else {
          this.log.error("Error: 'done' has already been called. Please check your script for extraneous calls to 'done'.");
        }
        return;
      }
      _done = true;

      if (info.httpOutputName && this.res && this.bindings[info.httpOutputName] === undefined) {
        this.bindings[info.httpOutputName] = this.res;
      }

      callback(err, {
        return: result,
        bindings: this.bindings
      });
    };
  }
}

function getLogger(invocationId: string, functionName: string, log: LogCallback): Logger{
    return Object.assign(
      <Log>(...args: any[]) => log(LogLevel.Information, ...args),
      {
        error: <Log>(...args: any[]) => log(LogLevel.Error, ...args),
        warn: <Log>(...args: any[]) => log(LogLevel.Warning, ...args),
        info: <Log>(...args: any[]) => log(LogLevel.Information, ...args),
        verbose: <Log>(...args: any[]) => log(LogLevel.Trace, ...args)
      }
    );
}

export interface InvocationResult {
  return: any;
  bindings: Dict<any>;
}

export type DoneCallback = (err?: Error | string, result?: any) => void;

export type LogCallback = (level: LogLevel, ...args: any[]) => void;

export type ResultCallback = (err?: any, result?: InvocationResult) => void;

export interface Dict<T> {
  [key: string]: T
}

// Allowed input types
export type InputTypes = HttpRequest | string | Buffer | null | undefined;

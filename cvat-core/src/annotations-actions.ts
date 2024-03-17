// Copyright (C) 2023 CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

/**
 * omit的用法如下:
 * ```javascript
 * const person = { name: 'John', age: 30, city: 'New York' };
 * const keysToOmit = ['age', 'city'];
 * const result = omit(person, keysToOmit);
 * console.log(result); // 输出: { name: 'John' }
 * ```
 * throttle的用法如下:
 * ```javascript
 * function heavyTask() {
 *   console.log('Heavy task is running');
 * }
 * const throttledTask = throttle(heavyTask, 1000); // 限制 heavyTask 函数每秒最多执行一次
 * ```
 */
import { omit, throttle } from 'lodash'; // omit 用于过滤
import { ArgumentError } from './exceptions'; // 使用自定义的参数错误异常
import { SerializedCollection } from './server-response-types'; // 这里结合omit获得一个 SerializedShape 的集合
import { Job, Task } from './session';
import { LogType, ObjectType } from './enums';
import ObjectState from './object-state';
import { getAnnotations, getCollection } from './annotations';

/**
 * 对单一 Frame 操作的Action输入定义
 */
export interface SingleFrameActionInput {
    // 使用omit过滤, 只留下 SerializedShape, 这是一个集合, 包含了所有被操作的 Annotation Shape
    collection: Omit<SerializedCollection, 'tracks' | 'tags' | 'version'>;
    // 指明这个 Action 是针对哪一个 frame 的
    frameData: {
        width: number;
        height: number;
        number: number;
    };
}

/**
 * 对单一 Frame 操作的输出定义, 可以看到, 输入和输出都是一个 SerializedShape 的集合
 */
export interface SingleFrameActionOutput {
    collection: Omit<SerializedCollection, 'tracks' | 'tags' | 'version'>;
}

/**
 * Action参数类型
 */
export enum ActionParameterType {
    SELECT = 'select',
    NUMBER = 'number',
}

/**
 * 一个Action 的参数是一个 Record<string, Type>
 * 一个Action会有多个参数，对应多个具体的Shape操作
 */
type ActionParameters = Record<string, {
    type: ActionParameterType;
    values: string[];
    defaultValue: string;
}>;
/**
 * 封装的，对单个Frame操作的Action，的基类。
 * 包括 初始化, 运行, 结束，设置了两个get方法来获得Action 名称和参数。
 */
export default class BaseSingleFrameAction {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public async init(
        sessionInstance: Job | Task,
        parameters: Record<string, string | number>,
    ): Promise<void> {
        throw new Error('Method not implemented');
    }

    public async destroy(): Promise<void> {
        throw new Error('Method not implemented');
    }

    public async run(sessionInstance: Job | Task, input: SingleFrameActionInput): Promise<SingleFrameActionOutput> {
        throw new Error('Method not implemented');
    }

    public get name(): string {
        throw new Error('Method not implemented');
    }

    public get parameters(): ActionParameters | null {
        throw new Error('Method not implemented');
    }
}

/**
 * 移除掉已经过滤的Shape，不需要参数，一开始是空集合。
 */
class RemoveFilteredShapes extends BaseSingleFrameAction {
    public async init(): Promise<void> {
        // nothing to init
    }

    public async destroy(): Promise<void> {
        // nothing to destroy
    }

    public async run(): Promise<SingleFrameActionOutput> {
        return { collection: { shapes: [] } };
    }

    public get name(): string {
        return 'Remove filtered shapes';
    }

    public get parameters(): ActionParameters | null {
        return null;
    }
}

/**
 * 已注册的 Action
 */
const registeredActions: BaseSingleFrameAction[] = [];

/**
 * 列出所有已注册的Action
 */
export async function listActions(): Promise<BaseSingleFrameAction[]> {
    return [...registeredActions];
}

/**
 * 注册一个Action
 * @param action 待注册的Action, 必须保证是BaseSingleFrameAction类型并且名称是没有被注册过的
 */
export async function registerAction(action: BaseSingleFrameAction): Promise<void> {
    if (!(action instanceof BaseSingleFrameAction)) {
        throw new ArgumentError('Provided action is not instance of BaseSingleFrameAction');
    }

    const { name } = action;
    if (registeredActions.map((_action) => _action.name).includes(name)) {
        throw new ArgumentError(`Action name must be unique. Name "${name}" is already exists`);
    }

    registeredActions.push(action);
}

/**
 * 先注册一个 过滤掉的 Shapes
 */
registerAction(new RemoveFilteredShapes());

/**
 * 链式运行一个对单一 Frame 的操作的 actions
 * @param instance  frame属于哪个实例, Job 或者 Task
 * @param actionsChain  待执行的所有 action
 * @param actionParameters  action的参数
 * @param frameFrom 开始的frame id
 * @param frameTo   结束的frame id
 * @param filters   过滤器, 过滤一些不需要处理的 frame
 * @param onProgress    正在运行的Action
 * @param cancelled 某个Action是否被取消
 */
async function runSingleFrameChain(
    instance: Job | Task,
    actionsChain: BaseSingleFrameAction[],
    actionParameters: Record<string, string>[],
    frameFrom: number,
    frameTo: number,
    filters: string[],
    onProgress: (message: string, progress: number) => void,
    cancelled: () => boolean,
): Promise<void> {
    type IDsToHandle = { shapes: number[] };
    // 记录操作记录, 记录frame起始id和所有待执行的action名称
    const event = await instance.logger.log(LogType.annotationsAction, {
        from: frameFrom,
        to: frameTo,
        chain: actionsChain.map((action) => action.name).join(' => '),
    }, true);

    // if called too fast, it will freeze UI, so, add throttling here
    const wrappedOnProgress = throttle(onProgress, 100, { leading: true, trailing: true });
    const showMessageWithPause = async (message: string, progress: number, duration: number): Promise<void> => {
        // wrapper that gives a chance to abort action
        wrappedOnProgress(message, progress);
        await new Promise((resolve) => setTimeout(resolve, duration));
    };

    try {
        await showMessageWithPause('Actions initialization', 0, 500);
        if (cancelled()) {
            return;
        }

        await Promise.all(actionsChain.map((action, idx) => {
            const declaredParameters = action.parameters;
            if (!declaredParameters) {
                return action.init(instance, {});
            }

            const setupValues = actionParameters[idx];
            const parameters = Object.entries(declaredParameters).reduce((acc, [name, { type, defaultValue }]) => {
                if (type === ActionParameterType.NUMBER) {
                    acc[name] = +(Object.hasOwn(setupValues, name) ? setupValues[name] : defaultValue);
                } else {
                    acc[name] = (Object.hasOwn(setupValues, name) ? setupValues[name] : defaultValue);
                }
                return acc;
            }, {} as Record<string, string | number>);

            return action.init(instance, parameters);
        }));

        const exportedCollection = getCollection(instance).export();
        const handledCollection: SingleFrameActionInput['collection'] = { shapes: [] };
        const modifiedCollectionIDs: IDsToHandle = { shapes: [] };

        // Iterate over frames
        const totalFrames = frameTo - frameFrom + 1;
        for (let frame = frameFrom; frame <= frameTo; frame++) {
            const frameData = await Object.getPrototypeOf(instance).frames
                .get.implementation.call(instance, frame);

            // Ignore deleted frames
            if (!frameData.deleted) {
                // Get annotations according to filter
                const states: ObjectState[] = await getAnnotations(instance, frame, false, filters, null);
                const frameCollectionIDs = states.reduce<IDsToHandle>((acc, val) => {
                    if (val.objectType === ObjectType.SHAPE) {
                        acc.shapes.push(val.clientID as number);
                    }
                    return acc;
                }, { shapes: [] });

                // Pick frame collection according to filtered IDs
                let frameCollection = {
                    shapes: exportedCollection.shapes.filter((shape) => frameCollectionIDs
                        .shapes.includes(shape.clientID as number)),
                };

                // Iterate over actions on each not deleted frame
                for await (const action of actionsChain) {
                    ({ collection: frameCollection } = await action.run(instance, {
                        collection: frameCollection,
                        frameData: {
                            width: frameData.width,
                            height: frameData.height,
                            number: frameData.number,
                        },
                    }));
                }

                const progress = Math.ceil(+(((frame - frameFrom) / totalFrames) * 100));
                wrappedOnProgress('Actions are running', progress);
                if (cancelled()) {
                    return;
                }

                handledCollection.shapes.push(...frameCollection.shapes.map((shape) => omit(shape, 'id')));
                modifiedCollectionIDs.shapes.push(...frameCollectionIDs.shapes);
            }
        }

        await showMessageWithPause('Commiting handled objects', 100, 1500);
        if (cancelled()) {
            return;
        }

        exportedCollection.shapes.forEach((shape) => {
            if (Number.isInteger(shape.clientID) && !modifiedCollectionIDs.shapes.includes(shape.clientID as number)) {
                handledCollection.shapes.push(shape);
            }
        });

        await instance.annotations.clear();
        await instance.actions.clear();
        await instance.annotations.import({
            ...handledCollection,
            tracks: exportedCollection.tracks,
            tags: exportedCollection.tags,
        });

        event.close();
    } finally {
        wrappedOnProgress('Finalizing', 100);
        await Promise.all(actionsChain.map((action) => action.destroy()));
    }
}

/**
 * 运行 actions 的接口, 调用异步函数 runSingleFrameChain 实现 。
 * @param instance  frame属于哪个实例, Job 或者 Task
 * @param actionsChain  待执行的所有 action
 * @param actionParameters  action的参数
 * @param frameFrom 开始的frame id
 * @param frameTo   结束的frame id
 * @param filters   过滤器, 过滤一些不需要处理的 frame
 * @param onProgress    正在运行的Action
 * @param cancelled 某个Action是否被取消
 */
export async function runActions(
    instance: Job | Task,
    actionsChain: BaseSingleFrameAction[],
    actionParameters: Record<string, string>[],
    frameFrom: number,
    frameTo: number,
    filters: string[],
    onProgress: (message: string, progress: number) => void,
    cancelled: () => boolean,
): Promise<void> {
    // there will be another function for MultiFrameChains (actions handling tracks)
    return runSingleFrameChain(
        instance,
        actionsChain,
        actionParameters,
        frameFrom,
        frameTo,
        filters,
        onProgress,
        cancelled,
    );
}

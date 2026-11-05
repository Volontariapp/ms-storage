import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PostgresFileRepository } from '@volontariapp/domain-storage';
import { requestFilePurge } from '../../../commands/request-file-purge.command.js';
import {
  createMockPurgeDataSource,
  createMockPurgeRepository,
  type PurgeDataSourceMock,
} from './request-file-purge.mock.js';

describe('requestFilePurge', () => {
  let dataSource: PurgeDataSourceMock;
  let repository: jest.Mocked<PostgresFileRepository>;
  let requestPurge: jest.SpiedFunction<PostgresFileRepository['requestPurge']>;
  const emitterId = '0f8fad5b-d9cb-469f-a165-70867728950e';

  beforeEach(() => {
    dataSource = createMockPurgeDataSource();
    repository = createMockPurgeRepository();
    requestPurge = jest.spyOn(repository, 'requestPurge');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the connection, requests the purge with the emitter, then closes it', async () => {
    requestPurge.mockResolvedValue(true);

    const requested = await requestFilePurge({
      dataSource,
      createRepository: () => repository,
      emitterId,
    });

    expect(requested).toBe(true);
    expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    expect(requestPurge).toHaveBeenCalledWith(emitterId);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('returns false when no file is ORPHANED', async () => {
    requestPurge.mockResolvedValue(false);

    await expect(
      requestFilePurge({ dataSource, createRepository: () => repository, emitterId }),
    ).resolves.toBe(false);
  });

  it('generates a uuid emitter when none is given', async () => {
    requestPurge.mockResolvedValue(true);

    await requestFilePurge({ dataSource, createRepository: () => repository });

    const [generated] = requestPurge.mock.calls[0];
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not reopen an initialized connection', async () => {
    dataSource = createMockPurgeDataSource(true);
    requestPurge.mockResolvedValue(true);

    await requestFilePurge({ dataSource, createRepository: () => repository, emitterId });

    expect(dataSource.initialize).not.toHaveBeenCalled();
  });

  it('closes the connection and rethrows when the request fails', async () => {
    requestPurge.mockRejectedValue(new Error('db down'));

    await expect(
      requestFilePurge({ dataSource, createRepository: () => repository, emitterId }),
    ).rejects.toThrow('db down');
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });
});

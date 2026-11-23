import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { User } from './user.entity';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async create(
    manager: EntityManager,
    data: { id: string; email: string; name: string; passwordHash: string },
  ): Promise<User> {
    const user = manager.create(User, { ...data, email: normalizeEmail(data.email) });
    return manager.save(user);
  }
}

import { Request, Response } from 'express';
import { Between, IsNull, Not } from "typeorm";
import { administration } from "./administration";
import { access } from "../access/access";
import { room } from '../room/room';


export const generateDailyReport = async (req: Request, res: Response) => {
    try {
        const now = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/Madrid"}));
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        startOfMonth.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        
        const accesses = await access.find({
            where: {
                entry_datetime: Between(startOfMonth, endOfToday),
                exit_datetime: Not(IsNull()),
            },
            relations: ['person', 'room']
        });

        const totalAccesses = accesses.length;

        
        const absences = await access.find({
            where: {
                entry_datetime: Between(startOfMonth, endOfToday),
                state: 'cancelled'
            },
            relations: ['person', 'room']
        });

        const totalAbsences = absences.length;

        
        const allActiveUsers = await access.createQueryBuilder("access")
            .select("access.person_id", "userId")
            .addSelect("COUNT(*)", "accessCount")
            .addSelect("person.name", "name")
            .addSelect("person.surnames", "surnames")
            .innerJoin("access.person", "person")
            .where("access.entry_datetime BETWEEN :start AND :end", { start: startOfMonth, end: endOfToday })
            .andWhere("access.exit_datetime IS NOT NULL")
            .groupBy("access.person_id")
            .addGroupBy("person.name")
            .addGroupBy("person.surnames")
            .orderBy("accessCount", "DESC")
            .getRawMany();

        
        const frequentUsers = allActiveUsers.filter(user => parseInt(user.accessCount) > 3);
        const infrequentUsers = allActiveUsers.filter(user => parseInt(user.accessCount) <= 3);

        
        const detailedReport = {
            report_period: {
                start_date: startOfMonth,
                end_date: endOfToday
            },
            total_accesses: totalAccesses,
            total_absences: totalAbsences,
            accesses: accesses.map(a => ({
                person: `${a.person.name} ${a.person.surnames}`,
                room: a.room.room_name,
                entry_time: a.entry_datetime,
                exit_time: a.exit_datetime
            })),
            absences: absences.map(a => ({
                person: `${a.person.name} ${a.person.surnames}`,
                room: a.room.room_name,
                scheduled_entry_time: a.entry_datetime,
            })),
            frequent_users: frequentUsers.map(u => ({
                name: `${u.name} ${u.surnames}`,
                accessCount: parseInt(u.accessCount)
            })),
            infrequent_users: infrequentUsers.map(u => ({
                name: `${u.name} ${u.surnames}`,
                accessCount: parseInt(u.accessCount)
            }))
        };

        
        const newReport = new administration();
        newReport.report_date = now;
        newReport.total_accesses = totalAccesses;
        newReport.total_absences = totalAbsences;
        newReport.frequent_users = JSON.stringify(detailedReport.frequent_users);
        newReport.infrequent_users = JSON.stringify(detailedReport.infrequent_users);
        await newReport.save();

        
        res.status(201).json({
            success: true,
            message: "Daily report generated and saved successfully",
            data: detailedReport
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error generating daily report",
            error: error 
        });
    }
}

export const getRoomUsageStats = async (req: Request, res: Response) => {
    try {
        
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        
        const accesses = await access.find({
            where: {
                entry_datetime: Between(startDate, endDate)
            },
            relations: ['room']
        });

        
        const rooms = await room.find();

        
        const daysInPeriod = now.getDate();

        
        const roomStats = rooms.map(room => {
            const roomAccesses = accesses.filter(a => a.room.id === room.id);
            const completedAccesses = roomAccesses.filter(a => a.exit_datetime !== null);
            const cancelledAccesses = roomAccesses.filter(a => a.state === 'cancelled');
            const totalAccesses = roomAccesses.length - cancelledAccesses.length;

            
            let totalHours = 0;
            let totalDuration = 0;

            completedAccesses.forEach(a => {
                if (a.exit_datetime) {
                    const duration = (a.exit_datetime.getTime() - a.entry_datetime.getTime()) / (1000 * 60 * 60);
                    totalHours += duration;
                    totalDuration += duration;
                }
            });

            const averageDuration = completedAccesses.length > 0 ? totalDuration / completedAccesses.length : 0;

            return {
                room_id: room.id,
                room_name: room.room_name,
                total_accesses: totalAccesses,
                completed_accesses: completedAccesses.length,
                cancelled_accesses: cancelledAccesses.length,
                total_hours_used: parseFloat(totalHours.toFixed(2)),
                average_duration: parseFloat(averageDuration.toFixed(2))
            };
        });

        
        const totalAccesses = roomStats.reduce((sum, stat) => sum + stat.total_accesses, 0);
        const totalCancellations = roomStats.reduce((sum, stat) => sum + stat.cancelled_accesses, 0);
        const totalHoursUsed = roomStats.reduce((sum, stat) => sum + stat.total_hours_used, 0);

        
        const response = {
            period: `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
            days_in_period: daysInPeriod,
            total_accesses: totalAccesses,
            total_cancellations: totalCancellations,
            total_hours_used: parseFloat(totalHoursUsed.toFixed(2)),
            room_stats: roomStats
        };

        
        res.status(200).json({
            success: true,
            message: "Room usage statistics from the beginning of the month to today retrieved successfully",
            data: response
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error retrieving room usage statistics",
            error: error
        });
    }
};

export const getDateReport = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: "Start date and end date are required"
            });
        }
        const startDate = new Date(start_date as string);
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format. Use YYYY-MM-DD"
            });
        }

        
        const accesses = await access.find({
            where: {
                entry_datetime: Between(startDate, endDate),
                exit_datetime: Not(IsNull()),
            },
            relations: ['person', 'room']
        });

        const totalAccesses = accesses.length;

        
        const absences = await access.find({
            where: {
                entry_datetime: Between(startDate, endDate),
                state: 'cancelled'
            },
            relations: ['person', 'room']
        });

        const totalAbsences = absences.length;

        
        const allActiveUsers = await access.createQueryBuilder("access")
            .select("access.person_id", "userId")
            .addSelect("COUNT(*)", "accessCount")
            .addSelect("person.name", "name")
            .addSelect("person.surnames", "surnames")
            .innerJoin("access.person", "person")
            .where("access.entry_datetime BETWEEN :start AND :end", { start: startDate, end: endDate })
            .andWhere("access.exit_datetime IS NOT NULL")
            .groupBy("access.person_id")
            .addGroupBy("person.name")
            .addGroupBy("person.surnames")
            .orderBy("accessCount", "DESC")
            .getRawMany();

        
        const frequentUsers = allActiveUsers.filter(user => parseInt(user.accessCount) > 3);
        const infrequentUsers = allActiveUsers.filter(user => parseInt(user.accessCount) <= 3);

        
        const detailedReport = {
            report_period: {
                start_date: startDate,
                end_date: endDate
            },
            total_accesses: totalAccesses,
            total_absences: totalAbsences,
            accesses: accesses.map(a => ({
                person: `${a.person.name} ${a.person.surnames}`,
                room: a.room.room_name,
                entry_time: a.entry_datetime,
                exit_time: a.exit_datetime
            })),
            absences: absences.map(a => ({
                person: `${a.person.name} ${a.person.surnames}`,
                room: a.room.room_name,
                scheduled_entry_time: a.entry_datetime,
            })),
            frequent_users: frequentUsers.map(u => ({
                name: `${u.name} ${u.surnames}`,
                accessCount: parseInt(u.accessCount)
            })),
            infrequent_users: infrequentUsers.map(u => ({
                name: `${u.name} ${u.surnames}`,
                accessCount: parseInt(u.accessCount)
            }))
        };

        
        const newReport = new administration();
        newReport.report_date = startDate;
        newReport.total_accesses = totalAccesses;
        newReport.total_absences = totalAbsences;
        newReport.frequent_users = JSON.stringify(detailedReport.frequent_users);
        newReport.infrequent_users = JSON.stringify(detailedReport.infrequent_users);
        await newReport.save();

        
        res.status(201).json({
            success: true,
            message: "Custom report generated and saved successfully",
            data: detailedReport
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Error generating custom report",
            error: error
        });
    }
}
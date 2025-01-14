import { Request, Response } from 'express';
import { accessHistory } from '../accessHistory/accessHistory';
import { Between } from 'typeorm';
import { room } from '../room/room';


export const getAccessHistories = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;

        
        if (!start_date || !end_date || typeof start_date !== 'string' || typeof end_date !== 'string') {
            return res.status(400).json({
                success: false,
                message: "Start date and end date are required"
            });
        }
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format. Use YYYY-MM-DD"
            });
        }

        
        endDate.setHours(23, 59, 59, 999);

        
        const histories = await accessHistory.find({
            where: {
                entry_datetime: Between(startDate, endDate)
            },
            relations: ['person', 'room'],
            order: { entry_datetime: 'DESC' }
        });

        
        const formattedHistories = histories.map(history => ({
            id: history.id,
            person_name: `${history.person.name} ${history.person.surnames}`,
            room_name: history.room.room_name,
            entry_datetime: history.entry_datetime,
            exit_datetime: history.exit_datetime
        }));
        return res.status(200).json({
            success: true,
            message: "Access histories retrieved successfully",
            data: formattedHistories
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while fetching access histories",
            error: error instanceof Error ? error.message : String(error)
        });
    }
};

export const getRoomAccessHistories = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;
        const room_id = parseInt(req.params.room_id);

        
        if (isNaN(room_id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid room ID"
            });
        }

        
        if (!start_date || !end_date || typeof start_date !== 'string' || typeof end_date !== 'string') {
            return res.status(400).json({
                success: false,
                message: "Start date and end date are required"
            });
        }
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid date format. Use YYYY-MM-DD"
            });
        }

        
        endDate.setHours(23, 59, 59, 999);

        
        const roomExists = await room.findOne({ where: { id: room_id } });
        if (!roomExists) {
            return res.status(404).json({
                success: false,
                message: "Room not found"
            });
        }

        
        const histories = await accessHistory.find({
            where: {
                room_id: room_id,
                entry_datetime: Between(startDate, endDate)
            },
            relations: ['person', 'room'],
            order: { entry_datetime: 'DESC' }
        });

        
        const formattedHistories = histories.map(history => ({
            id: history.id,
            person_name: `${history.person.name} ${history.person.surnames}`,
            room_name: history.room.room_name,
            entry_datetime: history.entry_datetime,
            exit_datetime: history.exit_datetime
        }));
        return res.status(200).json({
            success: true,
            message: "Room access histories retrieved successfully",
            data: {
                room_id: room_id,
                room_name: roomExists.room_name,
                access_histories: formattedHistories
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error getting room access histories",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}